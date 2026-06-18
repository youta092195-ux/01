import os

from forge_api.config import load_settings


if __name__ == "__main__":
    import uvicorn

    settings = load_settings()
    uvicorn.run(
        "forge_api.main:app",
        host=settings.host,
        port=settings.port,
        reload=os.getenv("FORGE_RELOAD", "false").lower() == "true",
    )
