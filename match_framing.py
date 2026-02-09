import cv2
import numpy as np
import os
import sys

class FaceFramer:
    def __init__(self):
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

    def detect_face(self, img):
        """
        Detects the largest face in the image.
        Returns (x, y, w, h) or None if no face found.
        """
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) == 0:
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
        
        # Check aspect ratio of the face itself (optional, but good for debugging)
        # We focus on the relation to the frame.
        
        metrics = {
            'width_ratio': fw / w_img,       # Face width relative to Image Width
            'height_ratio': fh / h_img,      # Face height relative to Image Height
            'rel_center_x': (fx + fw/2) / w_img, # Face center X relative to Image Width
            'rel_center_y': (fy + fh/2) / h_img, # Face center Y relative to Image Height
            'aspect_ratio': w_img / h_img    # Target Image Aspect Ratio
        }
        return metrics

    def crop_to_match(self, target_img_path, reference_metrics):
        """
        Crops/Pads the target image so the face matches the reference metrics.
        """
        img = cv2.imread(target_img_path)
        if img is None:
            print(f"Error: Could not read {target_img_path}")
            return None

        face = self.detect_face(img)
        if face is None:
            print(f"Error: No face detected in {target_img_path}")
            return None

        fx, fy, fw, fh = face
        
        # 1. Calculate Desired Crop Dimensions based on the Face Size
        # Target: CropWidth should be such that fw / CropWidth = RefWidthRatio
        # So: CropWidth = fw / RefWidthRatio
        
        target_w = int(fw / reference_metrics['width_ratio'])
        target_h = int(fh / reference_metrics['height_ratio'])
        
        # Ideally, we also want to respect the total aspect ratio of the reference
        # If the reference calculation led to different W/H ratios (e.g. face changed shape), 
        # we might need to compromise. 
        # For now, let's strictly enforce the computed required frame size to match face coverage.
        
        # 2. Calculate Desired Crop Position
        # We want the face center to be at 'rel_center_x' * target_w in the new image.
        
        face_cx = fx + fw/2
        face_cy = fy + fh/2
        
        # crop_x (top-left) should be:
        crop_x = int(face_cx - (target_w * reference_metrics['rel_center_x']))
        crop_y = int(face_cy - (target_h * reference_metrics['rel_center_y']))
        
        # 3. Handle Padding (if crop is outside image boundaries)
        # We use a canvas approach.
        
        # Create a blank canvas (black or mean color)
        # You can change borderMode to replicate or constant
        canvas = np.zeros((target_h, target_w, 3), dtype=np.uint8)
        
        # Calculate intersection
        src_x1 = max(0, crop_x)
        src_y1 = max(0, crop_y)
        src_x2 = min(img.shape[1], crop_x + target_w)
        src_y2 = min(img.shape[0], crop_y + target_h)
        
        dst_x1 = max(0, -crop_x)
        dst_y1 = max(0, -crop_y)
        dst_x2 = dst_x1 + (src_x2 - src_x1)
        dst_y2 = dst_y1 + (src_y2 - src_y1)
        
        if src_x2 > src_x1 and src_y2 > src_y1:
            try:
                canvas[dst_y1:dst_y2, dst_x1:dst_x2] = img[src_y1:src_y2, src_x1:src_x2]
            except Exception as e:
                print(f"Error cropping: {e}")
                
        return canvas

def main():
    framer = FaceFramer()
    
    # --- Configuration ---
    # Update these paths to your actual files
    
    # 1. The Reference Image (The one that "works well")
    ref_path = r"bg2.jpeg" # Using relative for demo, user should ensure path
    if not os.path.exists(ref_path):
        # Fallback for the user to edit
        ref_path = "bg2.jpeg"

    # 2. The Target Image (Webcam photo to fix)
    target_path = r"greg.jpg"
    if not os.path.exists(target_path):
        target_path = "greg.jpg"

    output_path = "crossed_img.jpg"

    print(f"Reference: {ref_path}")
    print(f"Target: {target_path}")

    # --- Processing ---
    try:
        # Load Reference
        ref_img = cv2.imread(ref_path)
        if ref_img is None:
            print("Please set a valid reference image path in the script.")
            return

        print("Analyzing Reference Image...")
        metrics = framer.get_face_metrics(ref_img)
        print(f"Reference Metrics: {metrics}")
        
        print("Processing Target Image...")
        result = framer.crop_to_match(target_path, metrics)
        
        if result is not None:
            cv2.imwrite(output_path, result)
            print(f"Successfully saved cropped image to: {os.path.abspath(output_path)}")
            
            # Optional: Show if running locally and gui is prompt (commented out for agent execution)
            # cv2.imshow("Result", result)
            # cv2.waitKey(0)
            # cv2.destroyAllWindows()
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
