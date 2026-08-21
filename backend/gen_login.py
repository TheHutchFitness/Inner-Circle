import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

PROMPT = (
    "Vertical cinematic matte-painting concept art, tall portrait composition, NO text, NO logos, "
    "NO watermark, NO UI. Cyberpunk + anime aesthetic fused with a hardcore powerlifting / strength "
    "theme, in the style of an epic Solo-Leveling key art. A single lone muscular warrior-athlete seen "
    "from behind as a dramatic silhouette, standing at the foot of a long glowing winding path / "
    "staircase of light that ascends into the distance through a fused fantasy world: a rusted "
    "post-apocalyptic wasteland gym at the bottom, rising past an industrial iron-forge valley, a "
    "stormy neon cyber-city clinging to cliffs, fiery volcanic ember peaks, and finally a radiant "
    "celestial temple-arena summit glowing at the very top. Deep blue and black palette with vivid "
    "electric-blue neon accents, atmospheric haze, dramatic god-rays streaming down from the summit. "
    "Aspirational, epic, moody. Environment and one distant silhouette only."
)


async def main():
    chat = LlmChat(api_key=API_KEY, session_id="login-journey", system_message="You are an expert cinematic key-art concept artist for AAA games.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _t, imgs = await chat.send_message_multimodal_response(UserMessage(text=PROMPT))
    if imgs:
        img = Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB")
        img.save(f"{OUT}/login-journey.png")
        print("OK", img.size)
    else:
        print("FAIL")


if __name__ == "__main__":
    asyncio.run(main())
