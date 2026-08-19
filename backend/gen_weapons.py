import asyncio, os, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images/weapons"
os.makedirs(OUT, exist_ok=True)
CANVAS = 1024
# vertical prop box on the right side of the figure (held/floating beside the avatar)
BOX = (0.66, 0.20, 0.99, 0.90)

WEAPONS = {
    "w_sword":  "a straight iron broadsword with a leather-wrapped grip",
    "w_bo":     "a long wooden bo quarterstaff",
    "w_daggers": "a pair of crossed steel combat daggers",
    "w_bow":    "a curved wooden recurve war bow with a drawn string",
    "w_katana": "a glowing neon energy katana with a blue plasma blade",
    "w_plasma": "a futuristic sci-fi plasma rifle with glowing blue energy cells",
    "w_axe":    "a massive double-bladed viking war axe with runic engravings",
    "w_glaive": "an ornate dragon glaive polearm with a curved crimson blade and dragon motifs",
}


def key_and_place(raw_bytes):
    im = Image.open(io.BytesIO(raw_bytes)).convert("RGBA").resize((CANVAS, CANVAS))
    px = im.load()
    for y in range(CANVAS):
        for x in range(CANVAS):
            r, g, b, a = px[x, y]
            if r > 150 and b > 150 and g < 115:
                px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    if not bbox:
        return canvas
    piece = im.crop(bbox)
    x0, y0, x1, y1 = BOX
    tw, th = int((x1 - x0) * CANVAS), int((y1 - y0) * CANVAS)
    scale = min(tw / piece.width, th / piece.height)
    nw, nh = max(1, int(piece.width * scale)), max(1, int(piece.height * scale))
    piece = piece.resize((nw, nh), Image.LANCZOS)
    cx = int(x0 * CANVAS + (tw - nw) / 2)
    cy = int(y0 * CANVAS + (th - nh) / 2)
    canvas.alpha_composite(piece, (cx, cy))
    return canvas


async def gen(key, desc):
    prompt = (
        f"{desc}. A stylized 3D video-game weapon icon, cel-shaded, glossy, clean crisp outlines, "
        "high detail. The WEAPON ONLY — no hands, no person, no text. Oriented mostly VERTICAL, "
        "centered. Isolated on a solid pure magenta #FF00FF background; fill ALL empty space with "
        "flat solid magenta #FF00FF."
    )
    chat = LlmChat(api_key=API_KEY, session_id=f"weap-{key}", system_message="You are a stylized video-game weapon concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not imgs:
        print("FAIL", key, (t or "")[:60]); return
    key_and_place(base64.b64decode(imgs[0]["data"])).save(f"{OUT}/{key}.png")
    print("OK", key)


async def main():
    for k, d in WEAPONS.items():
        for attempt in range(2):
            try:
                await gen(k, d); break
            except Exception as e:
                print("ERR", k, str(e)[:60]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
