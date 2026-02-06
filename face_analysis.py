import cv2
import numpy as np
import base64

# Load the lightweight face detector (built-in to OpenCV)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def get_pure_facial_number(frame):
    # 1. Convert to Grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # 2. Detect Face
    faces = face_cascade.detectMultiScale(gray, 1.05, 3)
    
    if len(faces) == 0:
        # Fallback: Use center 50% of the image
        h_full, w_full = gray.shape
        cy, cx_full = h_full//2, w_full//2
        h, w = h_full//2, w_full//2
        x, y = max(0, cx_full - w//2), max(0, cy - h//2)
        faces = [(x, y, w, h)]
        print("Face detection failed, using center crop fallback.")

    # Pick the largest face found
    (x, y, w, h) = sorted(faces, key=lambda f: f[2], reverse=True)[0]
    
    # 3. Crop to the face only (NO RESIZING - keep original dimensions)
    face_crop = gray[y:y+h, x:x+w]
    face_height, face_width = face_crop.shape
    
    # Calculate centers based on actual dimensions
    center_x, center_y = face_width // 2, face_height // 2

    # 4. Create Gradient Magnitude Map using edge detection (shows facial features)
    # Apply Sobel operators to detect edges in X and Y directions
    sobelx = cv2.Sobel(face_crop, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(face_crop, cv2.CV_64F, 0, 1, ksize=3)
    
    # Calculate gradient magnitude (edge intensity map)
    gradient_map = np.sqrt(sobelx**2 + sobely**2)
    
    # 5. ADVANCED GEOMETRIC ANALYSIS OF GRADIENT MAP
    # Normalize gradient map to 0-255 for analysis
    gradient_normalized = cv2.normalize(gradient_map, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    
    # Feature 1: Gradient Centroid Distance from Center
    # Calculate the center of mass of the gradient intensity
    moments = cv2.moments(gradient_normalized)
    if moments['m00'] != 0:
        cx = int(moments['m10'] / moments['m00'])
        cy = int(moments['m01'] / moments['m00'])
    else:
        cx, cy = center_x, center_y  # Default to center
    
    centroid_distance = np.sqrt((cx - center_x)**2 + (cy - center_y)**2)
    
    # Feature 2: Find brightest spots (local maxima) and measure distances
    # Threshold to find significant edge intensity points
    _, thresh = cv2.threshold(gradient_normalized, 0.7 * gradient_normalized.max(), 255, cv2.THRESH_BINARY)
    
    # Find contours of bright regions
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Calculate distances between top edge intensity regions
    peak_distance = 0
    if len(contours) >= 2:
        # Get centroids of top 2 largest contours
        areas = [cv2.contourArea(c) for c in contours]
        top_contours = sorted(zip(contours, areas), key=lambda x: x[1], reverse=True)[:2]
        
        # Calculate centroids
        m1 = cv2.moments(top_contours[0][0])
        m2 = cv2.moments(top_contours[1][0])
        
        if m1['m00'] != 0 and m2['m00'] != 0:
            c1x, c1y = int(m1['m10']/m1['m00']), int(m1['m01']/m1['m00'])
            c2x, c2y = int(m2['m10']/m2['m00']), int(m2['m01']/m2['m00'])
            peak_distance = np.sqrt((c1x - c2x)**2 + (c1y - c2y)**2)
            peak_points = [(c1x, c1y), (c2x, c2y)]
    if 'peak_points' not in locals(): peak_points = []
    
    # Feature 3: Edge Intensity Distribution Asymmetry
    # Compare left vs right, top vs bottom edge intensity
    left_intensity = np.sum(gradient_map[:, :center_x])
    right_intensity = np.sum(gradient_map[:, center_x:])
    top_intensity = np.sum(gradient_map[:center_y, :])
    bottom_intensity = np.sum(gradient_map[center_y:, :])
    
    lr_asymmetry = abs(left_intensity - right_intensity) / (left_intensity + right_intensity + 1e-6)
    tb_asymmetry = abs(top_intensity - bottom_intensity) / (top_intensity + bottom_intensity + 1e-6)
    
    # Feature 4: Gradient Concentration (how focused vs spread out)
    total_intensity = np.sum(gradient_map)
    # Intensity in center region (25% of dimensions)
    center_w, center_h = face_width // 4, face_height // 4
    center_intensity = np.sum(gradient_map[center_y-center_h:center_y+center_h, center_x-center_w:center_x+center_w])
    concentration_ratio = center_intensity / (total_intensity + 1e-6)
    
    # Feature 5: Angular distribution of edge intensity
    # Divide into quadrants and measure
    q1 = np.sum(gradient_map[:center_y, :center_x])   # Top-left
    q2 = np.sum(gradient_map[:center_y, center_x:])   # Top-right
    q3 = np.sum(gradient_map[center_y:, :center_x])   # Bottom-left
    q4 = np.sum(gradient_map[center_y:, center_x:])   # Bottom-right
    
    quadrant_variance = np.var([q1, q2, q3, q4])
    
    # Feature 6: Edge Density (percentage of pixels with significant edges)
    edge_threshold = 0.3 * gradient_normalized.max()
    edge_pixels = np.sum(gradient_normalized > edge_threshold)
    total_pixels = face_width * face_height
    edge_density = edge_pixels / total_pixels
    
    # Feature 7: Texture Complexity Index (using gradient standard deviation)
    texture_complexity = np.std(gradient_map)
    
    # Feature 8: Radial Distribution (how edge intensity varies from center)
    y_coords, x_coords = np.ogrid[:face_height, :face_width]
    distances_from_center = np.sqrt((x_coords - center_x)**2 + (y_coords - center_y)**2)
    
    # Calculate mean intensity at different radii
    inner_radius = min(face_width, face_height) // 4
    outer_radius = min(face_width, face_height) // 3
    inner_circle = gradient_map[distances_from_center < inner_radius]
    outer_ring = gradient_map[distances_from_center > outer_radius]
    radial_contrast = np.mean(outer_ring) / (np.mean(inner_circle) + 1e-6)
    
    # Feature 9: Angular Momentum (weighted distribution around centroid)
    # This measures rotational asymmetry
    y_grid, x_grid = np.meshgrid(range(face_height), range(face_width), indexing='ij')
    dx = x_grid - cx
    dy = y_grid - cy
    angular_momentum = np.sum(gradient_map * (dx * dy)) / (total_intensity + 1e-6)
    
    # Feature 10: Dominant Orientation (using gradient direction)
    sobely = cv2.Sobel(face_crop, cv2.CV_64F, 0, 1, ksize=3) # Recompute if needed or reuse
    gradient_direction = np.arctan2(sobely, sobelx)
    # Weighted by gradient magnitude
    weighted_angles = gradient_direction * gradient_map
    dominant_orientation = np.sum(weighted_angles) / (total_intensity + 1e-6)
    
    # 6. COMBINE FEATURES INTO A 4-DIGIT NUMBER
    # Create a unique combination of measurements
    feature_vector = [
        centroid_distance * 100,      # Weight: 100
        peak_distance * 50,            # Weight: 50
        lr_asymmetry * 10000,          # Weight: 10000
        tb_asymmetry * 10000,          # Weight: 10000
        concentration_ratio * 5000,    # Weight: 5000
        quadrant_variance / 1000,      # Normalize variance
        edge_density * 3000,           # Weight: 3000
        texture_complexity * 10,       # Weight: 10
        radial_contrast * 1000,        # Weight: 1000
        abs(angular_momentum) / 100,   # Normalize
        abs(dominant_orientation) * 500 # Weight: 500
    ]
    
    # Combine features with weighted sum
    combined_value = sum(feature_vector)
    
    # Convert to 4-digit number
    lucky_number = int(combined_value) % 10000
    
    # --- VISUALIZATION GENERATION ---
    # Normalize gradient map for display
    display_map = cv2.normalize(gradient_map, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    annotated_map = cv2.cvtColor(display_map, cv2.COLOR_GRAY2BGR)
    
    # Draw Features
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.3, min(face_width, face_height) / 400)
    thickness = max(1, int(min(face_width, face_height) / 200))
    
    # Axes
    cv2.line(annotated_map, (center_x, 0), (center_x, face_height), (255, 255, 0), thickness)
    cv2.line(annotated_map, (0, center_y), (face_width, center_y), (255, 255, 0), thickness)
    
    # Circles
    cv2.circle(annotated_map, (center_x, center_y), inner_radius, (0, 255, 255), thickness)
    cv2.circle(annotated_map, (center_x, center_y), outer_radius, (0, 255, 255), thickness)
    
    # Centroids
    cv2.circle(annotated_map, (cx, cy), max(3, thickness*2), (0, 0, 255), -1) 
    cv2.line(annotated_map, (cx, cy), (center_x, center_y), (255, 0, 0), thickness)
    
    # Peaks
    for px, py in peak_points:
        cv2.circle(annotated_map, (px, py), max(3, thickness*2), (255, 0, 255), thickness)
        
    # Encode
    _, buffer = cv2.imencode('.jpg', annotated_map)
    visual_b64 = base64.b64encode(buffer).decode('utf-8')
    visual_data_uri = f"data:image/jpeg;base64,{visual_b64}"
    
    # Create measurements dict
    measurements = {
        "Symmetry Index": f"{int((1 - min(1, (lr_asymmetry + tb_asymmetry))) * 100)}%",
        "Texture Complexity": f"{texture_complexity:.2f}",
        "Feature Density": f"{int(concentration_ratio * 100)}%",
        "Geometric Balance": f"{int(radial_contrast * 10)}/10",
        "Structural Integrity": f"{int(edge_density * 500)}",
        "Harmonic Resonance": f"{abs(angular_momentum):.2f}",
        "visual_data_uri": visual_data_uri
    }

    return f"{lucky_number:04d}", gradient_map, face_crop, measurements

def generate_lucky_number_from_face(image_path):
    """
    Generate a 4-digit lucky number and analytics from facial features.
    Returns: (number_string, measurements_dict)
    """
    try:
        frame = cv2.imread(image_path)
        if frame is None:
            print(f"Error: Could not load image from {image_path}")
            return "0000", {}
            
        number, _, _, measurements = get_pure_facial_number(frame)
        
        return number, measurements
    except Exception as e:
        print(f"Error generating facial number: {e}")
        return "0000", {}
