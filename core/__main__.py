import logging

import uvicorn

from core.app import create_app
from core.settings import settings

logging.basicConfig(level=logging.DEBUG if settings.dev else logging.INFO)


def main() -> None:
    uvicorn.run(
        "core.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        reload=settings.dev,
    )


if __name__ == "__main__":
    main()
