import cv2
import numpy as np
import os
import sys

# Try importing MediaPipe for robust detection
try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    print("⚠️ MediaPipe not found. Smart cropping might use fallback.")

class FaceFramer:
    def __init__(self):
        if MEDIAPIPE_AVAILABLE:
            self.mp_face_detection = mp.solutions.face_detection
            self.face_detection = self.mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
        else:
            # Fallback to Haar Cascade
            self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

    def detect_face(self, img):
        """
        Detects the largest face in the image.
        Returns (x, y, w, h) or None if no face found.
        """
        if MEDIAPIPE_AVAILABLE:
            # MediaPipe expects RGB
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = self.face_detection.process(img_rgb)
            
            if not results.detections:
                return None
                
            h_img, w_img, _ = img.shape
            
            # Format results into a list of (x, y, w, h)
            faces = []
            for detection in results.detections:
                bboxC = detection.location_data.relative_bounding_box
                x = int(bboxC.xmin * w_img)
                y = int(bboxC.ymin * h_img)
                w = int(bboxC.width * w_img)
                h = int(bboxC.height * h_img)
                faces.append((x, y, w, h))
            
            if not faces:
                return None
            return max(faces, key=lambda f: f[2] * f[3])
        else:
            # Fallback Haar Cascade
            if len(img.shape) == 3:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            else:
                gray = img
            faces = self.face_cascade.detectMultiScale(gray, 1.1, 4)
            
            if len(faces) == 0:
                return None
            return max(faces, key=lambda f: f[2] * f[3])

    def get_face_metrics(self, img):
        """
        Calculates face ratios and position relative to the image.
        """
        face = self.detect_face(img)
        if face is None:
            raise ValueError("No face detected in reference image.")
        
        fx, fy, fw, fh = face
        h_img, w_img = img.shape[:2]
        
        metrics = {
            'width_ratio': fw / w_img,       # Face width relative to Image Width
            'height_ratio': fh / h_img,      # Face height relative to Image Height
            'rel_center_x': (fx + fw/2) / w_img, # Face center X relative to Image Width
            'rel_center_y': (fy + fh/2) / h_img, # Face center Y relative to Image Height
            'aspect_ratio': w_img / h_img    # Target Image Aspect Ratio
        }
        return metrics

    def crop_to_match(self, target_img_path, reference_metrics, zoom=1.0):
        """
        Crops the target image to match reference composition EXACTLY (Zoom=1.0).
        Constrains crop to image boundaries to avoid padding/black borders.
        """
        img = cv2.imread(target_img_path)
        if img is None:
            print(f"Error: Could not read {target_img_path}")
            return None

        h_img, w_img = img.shape[:2]

        face = self.detect_face(img)
        if face is None:
            print(f"Error: No face detected in {target_img_path}")
            return None

        fx, fy, fw, fh = face
        face_cx = fx + fw/2
        face_cy = fy + fh/2

        # 1. Target Crop Dimensions (Ideal)
        # Based on Reference Face-to-Image Ratio * Zoom (1.0 = Exact Match)
        target_w = int((fw / reference_metrics['width_ratio']) * zoom)
        target_h = int(target_w / reference_metrics['aspect_ratio'])
        
        # 2. Constrain to Image Boundaries (No Padding)
        if target_w > w_img:
            target_w = w_img
            target_h = int(target_w / reference_metrics['aspect_ratio'])
            
        if target_h > h_img:
            target_h = h_img
            target_w = int(target_h * reference_metrics['aspect_ratio'])
            
        # 3. Calculate Top-Left Position (Centering on Face Target)
        crop_x = int(face_cx - (target_w * reference_metrics['rel_center_x']))
        crop_y = int(face_cy - (target_h * reference_metrics['rel_center_y']))
        
        # 4. Clamp Position to Stay Inside Image
        crop_x = max(0, min(crop_x, w_img - target_w))
        crop_y = max(0, min(crop_y, h_img - target_h))
        
        # 5. Crop
        crop_img = img[crop_y:crop_y+target_h, crop_x:crop_x+target_w]
        return crop_img

def perform_smart_crop(target_path, ref_path="bg2.jpeg"):
    """
    Attempts to crop the target image to match the reference framing.
    Overwrites target_path with the cropped result if successful.
    """
    print(f"✂️ Attempting smart crop on {target_path}...")
    if not os.path.exists(ref_path):
        print(f"⚠️ Reference image not found at {ref_path}. Skipping smart crop.")
        return False

    try:
        framer = FaceFramer()
        
        # 1. Analyze Reference
        ref_img = cv2.imread(ref_path)
        if ref_img is None:
            print("⚠️ Could not read reference image.")
            return False
            
        metrics = framer.get_face_metrics(ref_img)
        
        # 2. Crop Target
        # Zoom > 1.0 zooms out (wider frame)
        # Zoom < 1.0 zooms in (tighter frame)
        # User requested reducing from ~70% to ~65% face size -> ~1.08 factor
        cropped_img = framer.crop_to_match(target_path, metrics, zoom=1.08)
        
        if cropped_img is not None:
            cv2.imwrite(target_path, cropped_img)
            print("✅ Smart crop successful! Overwrote target image.")
            return True
        else:
            print("⚠️ Smart crop failed (detection or calc error). Using original.")
            return False
            
    except Exception as e:
        print(f"❌ Smart crop exception: {e}")
        return False
