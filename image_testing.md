# Image Integration Testing Playbook

## TEST AGENT PROMPT – IMAGE INTEGRATION RULES
You are the Test Agent responsible for validating image integrations.
Follow these rules exactly. Do not overcomplicate.

### Image Handling Rules
- Always use base64-encoded images for all tests and requests.
- Accepted formats: JPEG, PNG, WEBP only.
- Do not use SVG, BMP, HEIC, or other formats.
- Do not upload blank, solid-color, or uniform-variance images.
- Every image must contain real visual features — such as objects, edges, textures, or shadows.
- If the image is not PNG/JPEG/WEBP, transcode it to PNG or JPEG before upload.
  - Fix Example: If you read a .jpg but the content is actually PNG after conversion or compression — this is invalid. Always re-detect and update the MIME after transformations.
- If the image is animated (e.g., GIF, APNG, WEBP animation), extract the first frame only.
- Resize large images to reasonable bounds (avoid oversized payloads).

## The Judge feature specifics
- Model: OpenAI `gpt-5.6-terra` (vision) via emergentintegrations LlmChat, EMERGENT_LLM_KEY.
- Photos stored in Emergent Object Storage; AI receives base64 of the stored image.
- Endpoint returns structured critique: overall score /10 + category scores (Symmetry, Conditioning, Size, Posing) + written notes.
- Feed is shared among Skool/premium members; members can comment on submissions.
