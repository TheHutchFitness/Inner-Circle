import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/tmp"

PROMPT = (
    "A single cyberpunk sci-fi helmet, glowing blue visor, isolated on a solid pure magenta "
    "(#FF00FF) background. Stylized 3D video-game gear render, cel-shaded. The helmet is drawn in "
    "the UPPER-CENTER of a square 1:1 frame, sized and positioned exactly where the HEAD of a "
    "centered standing full-body adult would be (roughly the top 18% of the frame, horizontally "
    "centered). Nothing else in the image — no body, no person, no text. Fill the rest of the frame "
    "with flat solid magenta #FF00FF only."
)

async def main():
    chat = LlmChat(api_key=API_KEY, session_id="gear-test", system_message="You are a stylized video-game gear concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=PROMPT))
    if not imgs:
        print("FAIL", (t or "")[:80]); return
    raw = base64.b64decode(imgs[0]["data"])
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    im.save(f"{OUT}/gear_raw.png")
    # chroma key out magenta
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 180 and b > 180 and g < 90:
                px[x, y] = (0, 0, 0, 0)
    im.save(f"{OUT}/gear_keyed.png")
    print("OK", im.size)

asyncio.run(main())
