import requests
import os

# Configuration
# Replace this with the actual IP of your Linux machine
LINUX_RECEIVER_URL = "http://192.168.1.XXX:5001/receive_workflow_data" 

def send_images_to_linux(original_image_path, generated_image_path):
    """
    Sends the original and generated images to the Linux machine.
    
    Args:
        original_image_path (str): Path to the user's uploaded/photo file.
        generated_image_path (str): Path to the locally generated result file.
    """
    if not os.path.exists(original_image_path):
        print(f"Error: Original file not found at {original_image_path}")
        return False
        
    if not os.path.exists(generated_image_path):
        print(f"Error: Generated file not found at {generated_image_path}")
        return False

    print(f"Preparing to send files to {LINUX_RECEIVER_URL}...")
    
    files = {
        'original_image': ('original.jpg', open(original_image_path, 'rb'), 'image/jpeg'),
        'generated_image': ('generated.png', open(generated_image_path, 'rb'), 'image/png')
    }
    
    try:
        response = requests.post(LINUX_RECEIVER_URL, files=files, timeout=30)
        
        if response.status_code == 200:
            print("✅ Successfully sent images to Linux machine.")
            print("Response:", response.json())
            return True
        else:
            print(f"❌ Failed to send. Status Code: {response.status_code}")
            print("Response:", response.text)
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"❌ Connection Error: Could not connect to {LINUX_RECEIVER_URL}")
        print("   - Check if the Linux script is running.")
        print("   - Check if the IP address is correct.")
        print("   - Check firewall settings.")
        return False
    except Exception as e:
        print(f"❌ Error sending files: {e}")
        return False
    finally:
        # Close file handles
        files['original_image'][1].close()
        files['generated_image'][1].close()

if __name__ == "__main__":
    # Test execution
    # Create dummy files for testing if they don't exist
    if not os.path.exists("test_orig.jpg"):
        with open("test_orig.jpg", "w") as f: f.write("dummy")
    if not os.path.exists("test_gen.png"):
        with open("test_gen.png", "w") as f: f.write("dummy")
        
    send_images_to_linux("test_orig.jpg", "test_gen.png")
