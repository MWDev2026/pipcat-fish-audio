FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    UV_COMPILE_BYTECODE=1 \
    UV_SYSTEM_PYTHON=1

# Install system dependencies needed for PyAudio, WebRTC, and media processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libswresample-dev \
    libasound2-dev \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set Hugging Face default non-root user (user 1000)
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app
RUN chown user:user /home/user/app

# Copy dependency files first for layer caching
COPY pyproject.toml .

# Install dependencies as root (system site-packages requires root ownership)
RUN uv pip install --no-cache -r pyproject.toml

# Copy application source code
COPY --chown=user:user . .

USER user

# Hugging Face Spaces expose port 7860 by default
EXPOSE 7860

# Launch bot runner on 0.0.0.0:7860 (deps already installed system-wide, no venv needed)
CMD ["python", "bot.py", "--host", "0.0.0.0", "--port", "7860"]
