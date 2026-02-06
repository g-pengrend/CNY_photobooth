import cv2
import numpy as np

# Load the lightweight face detector (built-in to OpenCV)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def get_pure_facial_number(frame):
    # 1. Convert to Grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # 2. Detect Face
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    
    if len(faces) == 0:
        return "No Face Detected", None, None, {}

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
    peak_points = []
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
        else:
            peak_distance = 0
    else:
        peak_distance = 0
    
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
    
    # Store measurements for display
    measurements = {
        'centroid_distance': round(centroid_distance, 2),
        'centroid_position': (cx, cy),
        'peak_distance': round(peak_distance, 2),
        'peak_points': peak_points,
        'lr_asymmetry': round(lr_asymmetry, 4),
        'tb_asymmetry': round(tb_asymmetry, 4),
        'concentration_ratio': round(concentration_ratio, 4),
        'quadrant_variance': round(quadrant_variance, 2),
        'edge_density': round(edge_density, 4),
        'texture_complexity': round(texture_complexity, 2),
        'radial_contrast': round(radial_contrast, 4),
        'angular_momentum': round(angular_momentum, 2),
        'dominant_orientation': round(dominant_orientation, 4),
        'quadrant_values': {
            'Q1 (Top-Left)': round(q1, 2),
            'Q2 (Top-Right)': round(q2, 2),
            'Q3 (Bottom-Left)': round(q3, 2),
            'Q4 (Bottom-Right)': round(q4, 2)
        },
        'face_dimensions': (face_width, face_height),
        'center': (center_x, center_y),
        'inner_radius': inner_radius,
        'outer_radius': outer_radius
    }
    
    return f"{lucky_number:04d}", gradient_map, face_crop, measurements


# --- Load image from file and save outputs ---
# Specify the input image path
input_image_path = 'bg2.jpeg'  # Change this to your image path

# Load the image
frame = cv2.imread(input_image_path)

if frame is None:
    print(f"Error: Could not load image from {input_image_path}")
else:
    # Process the image
    number, gradient_map, face_gray, measurements = get_pure_facial_number(frame)
    
    print(f"\n{'='*50}")
    print(f"Lucky Number: {number}")
    print(f"{'='*50}")
    
    # Display all measurements
    if measurements:
        print("\n" + "="*60)
        print("GEOMETRIC & STATISTICAL ANALYSIS")
        print("="*60)
        
        print("\n[PRIMARY GEOMETRIC FEATURES]")
        print(f"  • Centroid Distance from Center: {measurements['centroid_distance']} pixels")
        print(f"  • Centroid Position: {measurements['centroid_position']}")
        print(f"  • Peak Distance (brightest regions): {measurements['peak_distance']} pixels")
        
        print("\n[SYMMETRY ANALYSIS]")
        print(f"  • Left-Right Asymmetry: {measurements['lr_asymmetry']}")
        print(f"  • Top-Bottom Asymmetry: {measurements['tb_asymmetry']}")
        
        print("\n[DISTRIBUTION METRICS]")
        print(f"  • Gradient Concentration Ratio: {measurements['concentration_ratio']}")
        print(f"  • Quadrant Variance: {measurements['quadrant_variance']}")
        print(f"  • Radial Contrast (outer/inner): {measurements['radial_contrast']}")
        
        print("\n[TEXTURE & COMPLEXITY]")
        print(f"  • Edge Density: {measurements['edge_density']} ({measurements['edge_density']*100:.2f}%)")
        print(f"  • Texture Complexity Index: {measurements['texture_complexity']}")
        
        print("\n[ADVANCED FEATURES]")
        print(f"  • Angular Momentum: {measurements['angular_momentum']}")
        print(f"  • Dominant Orientation: {measurements['dominant_orientation']} radians")
        
        print(f"\n[QUADRANT INTENSITY VALUES]")
        for quad, value in measurements['quadrant_values'].items():
            print(f"  • {quad}: {value}")
        print(f"\n{'='*60}\n")
    
    # If a face is found, save the face crop and gradient map
    if gradient_map is not None:
        # Get the face crop to save
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) > 0:
            # Pick the largest face found
            (x, y, w, h) = sorted(faces, key=lambda f: f[2], reverse=True)[0]
            
            # Crop the original face (in color) - NO RESIZING
            face_crop_color = frame[y:y+h, x:x+w]
            
            # Save the original face crop (color) - full size
            cv2.imwrite('face_crop.jpg', face_crop_color)
            print(f"Saved: face_crop.jpg (color, {measurements['face_dimensions'][0]}x{measurements['face_dimensions'][1]})")
            
            # Save the grayscale face - full size
            cv2.imwrite('face_gray.jpg', face_gray)
            print(f"Saved: face_gray.jpg (grayscale, {measurements['face_dimensions'][0]}x{measurements['face_dimensions'][1]})")
            
            # Normalize gradient map for display and save
            display_map = cv2.normalize(gradient_map, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
            cv2.imwrite('gradient_map.jpg', display_map)
            print(f"Saved: gradient_map.jpg (edge detection, {measurements['face_dimensions'][0]}x{measurements['face_dimensions'][1]})")
            
            # Create a COMPREHENSIVE annotated version showing ALL calculation elements
            if measurements:
                # Start with color version of gradient map
                annotated_map = cv2.cvtColor(display_map, cv2.COLOR_GRAY2BGR)
                
                # Get dimensions and key points
                face_w, face_h = measurements['face_dimensions']
                cx, cy = measurements['centroid_position']
                center_x, center_y = measurements['center']
                inner_r = measurements['inner_radius']
                outer_r = measurements['outer_radius']
                
                # Font settings
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = max(0.3, min(face_w, face_h) / 400)  # Scale font with image size
                thickness = max(1, int(min(face_w, face_h) / 200))
                
                # === 1. DRAW SYMMETRY AXES (Cyan) ===
                cv2.line(annotated_map, (center_x, 0), (center_x, face_h), (255, 255, 0), thickness)  # Vertical
                cv2.line(annotated_map, (0, center_y), (face_w, center_y), (255, 255, 0), thickness)  # Horizontal
                
                # === 2. DRAW QUADRANT LABELS (White) ===
                label_offset = int(min(face_w, face_h) * 0.05)
                cv2.putText(annotated_map, 'Q1', (label_offset, label_offset + 15), font, font_scale, (255, 255, 255), thickness)
                cv2.putText(annotated_map, 'Q2', (face_w - label_offset - 30, label_offset + 15), font, font_scale, (255, 255, 255), thickness)
                cv2.putText(annotated_map, 'Q3', (label_offset, face_h - label_offset), font, font_scale, (255, 255, 255), thickness)
                cv2.putText(annotated_map, 'Q4', (face_w - label_offset - 30, face_h - label_offset), font, font_scale, (255, 255, 255), thickness)
                
                # === 3. DRAW RADIAL CIRCLES (Yellow) ===
                # Inner circle (for radial contrast calculation)
                cv2.circle(annotated_map, (center_x, center_y), inner_r, (0, 255, 255), thickness)
                # Outer circle
                cv2.circle(annotated_map, (center_x, center_y), outer_r, (0, 255, 255), thickness)
                # Label radii
                cv2.putText(annotated_map, f'r={inner_r}', (center_x + inner_r + 5, center_y), font, font_scale * 0.8, (0, 255, 255), thickness)
                cv2.putText(annotated_map, f'r={outer_r}', (center_x + outer_r + 5, center_y), font, font_scale * 0.8, (0, 255, 255), thickness)
                
                # === 4. DRAW CONCENTRATION BOX (Orange) ===
                center_w, center_h = face_w // 4, face_h // 4
                box_x1, box_y1 = center_x - center_w, center_y - center_h
                box_x2, box_y2 = center_x + center_w, center_y + center_h
                cv2.rectangle(annotated_map, (box_x1, box_y1), (box_x2, box_y2), (0, 165, 255), thickness)
                cv2.putText(annotated_map, 'Conc', (box_x1 + 5, box_y1 + 15), font, font_scale * 0.7, (0, 165, 255), thickness)
                
                # === 5. DRAW GRADIENT CENTROID (Red) ===
                cv2.circle(annotated_map, (cx, cy), max(3, thickness * 2), (0, 0, 255), -1)
                cv2.putText(annotated_map, 'C', (cx + 8, cy - 8), font, font_scale, (0, 0, 255), thickness)
                
                # === 6. DRAW GEOMETRIC CENTER (Green) ===
                cv2.circle(annotated_map, (center_x, center_y), max(3, thickness * 2), (0, 255, 0), -1)
                cv2.putText(annotated_map, 'O', (center_x + 8, center_y - 8), font, font_scale, (0, 255, 0), thickness)
                
                # === 7. DRAW CENTROID OFFSET LINE (Blue) ===
                cv2.line(annotated_map, (cx, cy), (center_x, center_y), (255, 0, 0), thickness, cv2.LINE_AA)
                # Label the distance
                mid_x, mid_y = (cx + center_x) // 2, (cy + center_y) // 2
                cv2.putText(annotated_map, f'd={measurements["centroid_distance"]:.1f}', 
                           (mid_x + 5, mid_y - 5), font, font_scale * 0.7, (255, 0, 0), thickness)
                
                # === 8. DRAW PEAK POINTS (Magenta) ===
                if measurements['peak_points']:
                    for i, (px, py) in enumerate(measurements['peak_points']):
                        cv2.circle(annotated_map, (px, py), max(3, thickness * 2), (255, 0, 255), max(2, thickness))
                        cv2.putText(annotated_map, f'P{i+1}', (px + 8, py + 8), font, font_scale * 0.8, (255, 0, 255), thickness)
                    
                    # Draw line between peaks
                    if len(measurements['peak_points']) == 2:
                        p1, p2 = measurements['peak_points']
                        cv2.line(annotated_map, p1, p2, (255, 0, 255), thickness, cv2.LINE_AA)
                        # Label peak distance
                        mid_px, mid_py = (p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2
                        cv2.putText(annotated_map, f'pk={measurements["peak_distance"]:.1f}', 
                                   (mid_px + 5, mid_py - 5), font, font_scale * 0.7, (255, 0, 255), thickness)
                
                # Save annotated image
                cv2.imwrite('gradient_map_annotated.jpg', annotated_map)
                print(f"Saved: gradient_map_annotated.jpg (comprehensive analysis, {face_w}x{face_h})")
                
                print("\n" + "="*60)
                print("ANNOTATION LEGEND")
                print("="*60)
                print("  • Cyan lines: Symmetry axes (L-R & T-B)")
                print("  • Yellow circles: Radial zones (inner/outer)")
                print("  • Orange box: Concentration region")
                print("  • Red dot (C): Gradient centroid")
                print("  • Green dot (O): Geometric center")
                print("  • Blue line: Centroid offset distance")
                print("  • Magenta circles (P1, P2): Peak intensity points")
                print("  • Magenta line: Peak-to-peak distance")
                print("  • Q1-Q4: Quadrant labels")
                print("="*60)
    else:
        print("No face detected in the image")