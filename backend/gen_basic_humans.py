import asyncio, os, base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

# Identical framing/clothing/lighting for every portrait so the ONLY differences
# are race/ethnicity and hair colour (per user request). Basic humans, basic clothing.
BASE = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible (head, torso, legs and feet all in frame), character-select screen "
    "art in the style of Fortnite / Overwatch / Valorant / Pixar — clearly NON-photorealistic, "
    "smooth cel-shaded stylized shading, semi-cartoon proportions, glossy stylized hair, clean crisp "
    "outlines, vibrant polished game-art look. A fit healthy adult standing relaxed and facing the "
    "camera with a calm confident expression. Plain fitted grey crew-neck t-shirt with plain dark "
    "athletic joggers and simple sneakers (basic everyday clothing, no logos, no patterns). Dark "
    "charcoal background with a subtle blue rim light. Do NOT make it a real photograph — it must "
    "look like a rendered animated video-game character. No text, no logos, no watermark, no border, "
    "no props, no accessories. "
)

# id -> (ethnicity/race, hair description)
LOOKS = {
    "avatar_ronin":     ("East Asian", "short straight black hair"),
    "avatar_kaido":     ("Middle Eastern", "short dark brown hair with a neat short beard"),
    "avatar_titan":     ("Black African", "clean-shaven bald head"),
    "avatar_saiyan":    ("Caucasian", "short spiky blonde hair"),
    "avatar_demon":     ("Hispanic Latino", "short dark brown hair"),
    "avatar_wolf":      ("Caucasian", "medium brown tousled hair"),
    "avatar_ghost":     ("Nordic Scandinavian", "short platinum white-blonde hair"),
    "avatar_dragon":    ("East Asian", "short bright red dyed hair"),
    "avatar_shinobi":   ("Japanese", "black hair with a short undercut"),
    "avatar_berserker": ("Caucasian", "long ginger red hair with a full beard"),
    "avatar_phoenix":   ("South Asian Indian", "short jet-black hair"),
    "avatar_oni":       ("Southeast Asian", "short wavy dark hair"),
    "avatar_samurai":   ("East Asian", "black hair tied in a small topknot"),
    "avatar_mecha":     ("Korean", "short silver-grey hair"),
    "avatar_thunder":   ("Caucasian", "short dirty-blonde hair"),
    "avatar_kraken":    ("Pacific Islander", "short thick black hair"),
    "avatar_ace":       ("Mixed race", "short curly black hair"),
    "avatar_star":      ("Caucasian", "short sandy light-brown hair"),
    "avatar_reaper":    ("Caucasian", "medium-length straight black hair"),
}


async def gen(key, ethnicity, hair, female, force=False):
    suffix = "_f" if female else ""
    fname = key.replace("avatar_", "av_")
    path = f"{OUT}/{fname}{suffix}.png"
    if os.path.exists(path) and not force:
        # we intentionally overwrite; keep flag for reruns
        pass
    who = "woman" if female else "man"
    prompt = BASE + f"Subject: a {ethnicity} {who} with {hair}."
    chat = LlmChat(api_key=API_KEY, session_id=f"bh-{key}{suffix}", system_message="You are an expert stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if imgs:
        with open(path, "wb") as f:
            f.write(base64.b64decode(imgs[0]["data"]))
        print("OK", key + suffix)
    else:
        print("FAIL", key + suffix, (t or "")[:80])


async def main():
    for key, (eth, hair) in LOOKS.items():
        for female in (False, True):
            for attempt in range(2):
                try:
                    await gen(key, eth, hair, female)
                    break
                except Exception as e:
                    print("ERR", key, female, attempt, str(e)[:80])
                    await asyncio.sleep(2)

if __name__ == "__main__":
    asyncio.run(main())

