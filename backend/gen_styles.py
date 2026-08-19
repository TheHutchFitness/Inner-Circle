import asyncio, os, sys, base64, io
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
from PIL import Image

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/images"

BASE = (
    "Stylized 3D video-game character render, square 1:1, FULL BODY head-to-toe standing pose with "
    "the entire figure visible, character-select screen art in the style of Fortnite / Overwatch / "
    "Valorant / Pixar — clearly NON-photorealistic, smooth cel-shaded stylized shading, semi-cartoon "
    "proportions, glossy stylized hair, clean crisp outlines. A fit healthy adult standing relaxed "
    "facing the camera. Plain fitted grey crew-neck t-shirt with dark athletic joggers and simple "
    "sneakers. Dark charcoal background with a subtle blue rim light. No text, no logos, no border. "
)
RACES = {"white": "White Caucasian", "black": "Black African", "asian": "East Asian",
         "native": "Native American Indigenous", "indian": "South Asian Indian"}
HAIR = {"black": "black", "brown": "brown", "blonde": "blonde", "red": "ginger red", "white": "platinum white"}
STYLES = {
    "long": "long flowing {c} hair",
    "buzz": "a very short {c} buzzcut",
    "pony": "{c} hair tied back in a ponytail",
}


async def one(prompt, path):
    if os.path.exists(path):
        print("skip", os.path.basename(path)); return
    chat = LlmChat(api_key=API_KEY, session_id=f"s-{os.path.basename(path)}", system_message="You are an expert stylized video-game character concept artist.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    t, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if imgs:
        Image.open(io.BytesIO(base64.b64decode(imgs[0]["data"]))).convert("RGB").save(path)
        print("OK", os.path.basename(path))
    else:
        print("FAIL", os.path.basename(path))


async def main():
    style = sys.argv[1]
    hairdesc = STYLES[style]
    for race, eth in RACES.items():
        for hid, hword in HAIR.items():
            for female in (False, True):
                who = "woman" if female else "man"
                suffix = "_f" if female else ""
                path = f"{OUT}/av_{race}_{hid}_{style}{suffix}.png"
                prompt = BASE + f"Subject: a {eth} {who} with {hairdesc.format(c=hword)}."
                for attempt in range(2):
                    try:
                        await one(prompt, path); break
                    except Exception as e:
                        print("ERR", path, str(e)[:40]); await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
