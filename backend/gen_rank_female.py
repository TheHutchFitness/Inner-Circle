import asyncio, os, base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

EDIT_PROMPT = (
    "Edit this image: replace the male athlete with a strong athletic muscular FEMALE athlete. "
    "Keep the EXACT same pose, the same futuristic cyberpunk blue-neon tech-armor bodysuit, the same dark "
    "gym environment, the same dramatic blue rim lighting, the same camera angle and composition, and the "
    "same large empty negative space on the left side of the frame for UI text. Only the person changes to a "
    "female. Photorealistic, cinematic, high detail, blue neon glow. No text, no logos, no watermark."
)

TARGETS = {
    "rank-strength-female.png": "rank-strength-male.png",
    "rank-cardio-female.png": "rank-cardio-male.png",
}


async def gen(out_name, src_name):
    with open(f"{OUT}/{src_name}", "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    chat = LlmChat(api_key=API_KEY, session_id=f"rankf-{out_name}",
                   system_message="You are an expert photorealistic image editor.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=EDIT_PROMPT, file_contents=[ImageContent(image_base64=b64)])
    t, imgs = await chat.send_message_multimodal_response(msg)
    if imgs:
        with open(f"{OUT}/{out_name}", "wb") as f:
            f.write(base64.b64decode(imgs[0]["data"]))
        print("OK", out_name)
    else:
        print("FAIL", out_name, (t or "")[:120])


async def main():
    for out_name, src_name in TARGETS.items():
        try:
            await gen(out_name, src_name)
        except Exception as e:
            print("ERR", out_name, repr(e))


if __name__ == "__main__":
    asyncio.run(main())
