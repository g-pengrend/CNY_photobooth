6. Failure Cases
Context Switching Throttle: The single-machine design was an architectural failure due to insufficient VRAM for simultaneous residency of image and video models.
Unconstrained Diffusion: Early tests without Spatial Anchoring resulted in "melting" limbs, as the model lacked a consistent coordinate system.
API vs Web Format: Encountered failures when using ComfyUI's "Web Format" JSONs; the system now strictly requires "API Format" to ensure fixed node IDs for injection.
