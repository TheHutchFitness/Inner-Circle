import asyncio, os, sys, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images/gear"
os.makedirs(OUT, exist_ok=True)
CANVAS = 1024

# Slot target boxes (x0,y0,x1,y1 as fractions) tuned to the centered standing full-body avatars.
SLOT_BOX = {
    "helmet": (0.35, 0.015, 0.65, 0.205),
    "upper":  (0.22, 0.20, 0.78, 0.545),
    "legs":   (0.34, 0.50, 0.66, 0.885),
}
# Paired items get split left/right and placed at the sides (hands / feet positions).
PAIR_BOX = {
    "gloves": [(0.22, 0.48, 0.40, 0.66), (0.60, 0.48, 0.78, 0.66)],
    "boots":  [(0.33, 0.85, 0.50, 0.995), (0.50, 0.85, 0.67, 0.995)],
}

SLOT_DESC = {
    "helmet": "a single helmet / headgear",
    "upper":  "a single chest piece covering the torso, shoulders and both upper arms (no head, no legs)",
    "gloves": "a matching PAIR of gloves shown as two separate gloves side by side, left and right",
    "legs":   "leg armor / trousers covering BOTH legs from hip to ankle, shown centered (no feet, no torso)",
    "boots":  "a matching PAIR of boots / footwear shown as two boots side by side",
}

THEME_DESC = {
    "anime":  "vibrant colourful anime-hero",
    "knight": "medieval polished steel knight plate armor",
    "cyber":  "neon cyberpunk high-tech",
    "space":  "sleek white sci-fi astronaut spacesuit",
    "ancient": "ancient bronze gladiator warrior",
    "monk":   "simple earthy cloth monk / martial-arts",
    "arcade": "colourful retro video-game arcade themed",
}

THEMES = list(THEME_DESC.keys())
SLOTS = list(SLOT_DESC.keys())


def _place(piece, box):
    x0, y0, x1, y1 = box
    tw, th = int((x1 - x0) * CANVAS), int((y1 - y0) * CANVAS)
    pw, ph = piece.size
    scale = min(tw / pw, th / ph)
    nw, nh = max(1, int(pw * scale)), max(1, int(ph * scale))
    p = piece.resize((nw, nh), Image.LANCZOS)
    cx = int(x0 * CANVAS + (tw - nw) / 2)
    cy = int(y0 * CANVAS + (th - nh) / 2)
    return p, (cx, cy)


def key_and_place(raw_bytes, slot):
    im = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
    im = im.resize((CANVAS, CANVAS))
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 150 and b > 150 and g < 115:
                px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    if not bbox:
        return canvas
    piece = im.crop(bbox)
    if slot in PAIR_BOX:
        # split the cropped pair down the middle and place each half at its side box
        halfw = piece.width // 2
        left = piece.crop((0, 0, halfw, piece.height))
        right = piece.crop((halfw, 0, piece.width, piece.height))
        for half, box in zip((left, right), PAIR_BOX[slot]):
            hb = half.getbbox()
            if not hb:
                continue
            p, pos = _place(half.crop(hb), box)
            canvas.alpha_composite(p, pos)
    else:
        p, pos = _place(piece, SLOT_BOX[slot])
        canvas.alpha_composite(p, pos)
    return canvas


async def gen(theme, slot):
    desc = SLOT_DESC[slot]
    prompt = (
        f"{desc}, in a {THEME_DESC[theme]} style. Stylized 3D video-game gear render, cel-shaded, "
        "clean crisp outlines, glossy, high detail. The gear ITEM ONLY — absolutely no body, no "
        "person, no mannequin, no head, no skin, no text, no ground shadow. Centered in the frame. "
        "Isolated on a solid pure magenta #FF00FF background; fill ALL empty space with flat solid "
        "magenta #FF00FF."
    )
    chat = LlmChat(api_key=API_KEY, session_id=f"gear-{theme}-{slot}", system_message="You are a stylized video-game gear concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not imgs:
        print("FAIL", theme, slot, (t or "")[:60]); return
    out = key_and_place(base64.b64decode(imgs[0]["data"]), slot)
    out.save(f"{OUT}/gear_{theme}_{slot}.png")
    print("OK", f"gear_{theme}_{slot}")


async def main():
    themes = sys.argv[1].split(",") if len(sys.argv) > 1 else THEMES
    for theme in themes:
        for slot in SLOTS:
            for attempt in range(2):
                try:
                    await gen(theme, slot); break
                except Exception as e:
                    print("ERR", theme, slot, str(e)[:60]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
