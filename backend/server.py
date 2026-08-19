"""Composition root. All logic lives in shared.py + routes/*.py."""
import shared  # defines app, api_router, db, models, helpers, seed, events, middleware
from shared import app, api_router  # noqa: F401

# Importing each route module runs its @api_router decorators (registration).
from routes import (  # noqa: F401
    admin,
    ai,
    auth,
    cardio,
    chat,
    coach,
    enhanced,
    exercises,
    judge,
    leaderboard,
    misc,
    nutrition,
    payments,
    presets,
    profile,
    programs,
    quests,
    store,
    verify,
    workouts,
)

# Register all collected routes AFTER every module has been imported.
app.include_router(api_router)
