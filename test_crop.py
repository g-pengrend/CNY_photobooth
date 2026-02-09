import cv2
import numpy as np
import os

import mediapipe as mp

# --- Face Framer Logic (MediaPipe Version) ---
class FaceFramer:
    def __init__(self):
        self.mp_face_detection = mp.solutions.face_detection
        self.face_detection = self.mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)

    def detect_face(self, img):
        """
        Detects the largest face in the image using MediaPipe.
        Returns (x, y, w, h) or None if no face found.
        """
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
            
        # Return largest face
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
        Tries to make the Face-to-Image Ratio identical to the reference.
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
        
        # --- DEBUG: Save detection visualization ---
        debug_img = img.copy()
        cv2.rectangle(debug_img, (fx, fy), (fx+fw, fy+fh), (0, 255, 0), 3)
        cv2.imwrite("debug_detection.jpg", debug_img)
        # -------------------------------------------
        
        # 1. Target Crop Dimensions (Ideal)
        # Based on Reference Face-to-Image Ratio * Zoom (1.0 = Exact Match)
        target_w = int((fw / reference_metrics['width_ratio']) * zoom)
        target_h = int(target_w / reference_metrics['aspect_ratio'])
        
        # 2. Constrain to Image Boundaries (No Padding)
        # Verify Aspect Ratio is maintainable within image
        if target_w > w_img:
            target_w = w_img
            target_h = int(target_w / reference_metrics['aspect_ratio'])
            
        if target_h > h_img:
            target_h = h_img
            target_w = int(target_h * reference_metrics['aspect_ratio'])
            
        print(f"    Target Face: w={fw}, h={fh} @ ({face_cx}, {face_cy})")
        print(f"    Target Crop: {target_w}x{target_h} (Face covers {fw/target_w:.2%} of width)")
        print(f"    Reference Ratio: {reference_metrics['width_ratio']:.2%} (Target should match this)")
        
        # 3. Calculate Top-Left Position (Centering on Face Target)
        # Ideally: crop_x = face_cx - (target_w * rel_center_x)
        crop_x = int(face_cx - (target_w * reference_metrics['rel_center_x']))
        crop_y = int(face_cy - (target_h * reference_metrics['rel_center_y']))
        
        # 4. Clamp Position to Stay Inside Image
        # Ensure crop stays within [0, w_img] and [0, h_img]
        crop_x = max(0, min(crop_x, w_img - target_w))
        crop_y = max(0, min(crop_y, h_img - target_h))
        
        print(f"    Final Crop Origin: ({crop_x}, {crop_y})")
        
        # 5. Crop
        crop_img = img[crop_y:crop_y+target_h, crop_x:crop_x+target_w]
        return crop_img

def main():
    print("🧪 Starting Face Framing Test...")
    
    # 1. Configuration
    ref_path = "bg2.jpeg" 
    target_path = "red.jpg"
    output_path = "test_crop_result.jpg"
    
    # 2. Validation
    if not os.path.exists(ref_path):
        print(f"❌ Reference image '{ref_path}' not found!")
        return
        
    if not os.path.exists(target_path):
        print(f"❌ Target image '{target_path}' not found!")
        return
        
    # 3. Execution
    try:
        framer = FaceFramer()
        
        print(f"Analyzing reference: {ref_path}")
        ref_img = cv2.imread(ref_path)
        metrics = framer.get_face_metrics(ref_img)
        print(f"✅ Reference metrics calculated: {metrics}")
        
        print(f"Processing target: {target_path}")
        # ZOOM FACTOR: 1.0 (Exact Match to Reference Tightness)
        result = framer.crop_to_match(target_path, metrics, zoom=1.0)
        
        if result is not None:
            # Optional: Resize result to match reference height for easy comparison
            h_ref, w_ref = ref_img.shape[:2]
            h_res, w_res = result.shape[:2]
            scale = h_ref / h_res
            result_resized = cv2.resize(result, (int(w_res * scale), h_ref))
            
            cv2.imwrite(output_path, result_resized)
            print(f"✅ Success! Saved to: {os.path.abspath(output_path)}")
            print(f"   (Resized to match reference height: {h_ref}px)")
        else:
            print("❌ Failed to crop image.")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")

if __name__ == "__main__":
    main()
