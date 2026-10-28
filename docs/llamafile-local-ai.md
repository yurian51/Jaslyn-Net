# Jaslyn Net local AI with llamafile

Jaslyn Net can use Mozilla.ai's llamafile as a local inference backend for the existing AI Operating Layer.

## Architecture

Jaslyn API
  -> AI Operating Layer
  -> configured model provider
       -> llamafile
          -> llama.cpp
          -> local GGUF model

llamafile is an inference/runtime provider here. It does not receive authority to execute billing, payment, subscriber, AAA, or network changes. Jaslyn's existing tool registry, tenant scope, approval policy, command lifecycle, audit trail, and verification remain authoritative.

## Configuration

In apps/api/.env:

    JASLYN_AI_PROVIDER=llamafile
    JASLYN_LLAMAFILE_ENDPOINT=http://127.0.0.1:8080/v1
    JASLYN_LLAMAFILE_MODEL=LLaMA_CPP
    JASLYN_LLAMAFILE_API_KEY=
    JASLYN_LLAMAFILE_TIMEOUT_MS=15000

Start llamafile in server mode with a GGUF model. The current Mozilla.ai documentation exposes an OpenAI-compatible POST /v1/chat/completions endpoint, which is the interface used by this adapter.

For a remote edge node, keep the endpoint on a private network or behind authenticated transport. Do not expose the raw llamafile server directly to the public Internet.

## Provider behavior

- deterministic: no external model call; Jaslyn builds its evidence-first fallback plan.
- anthropic: existing remote planning provider.
- llamafile: local model planning through the OpenAI-compatible endpoint.
- If JASLYN_AI_PROVIDER=llamafile is selected and the local runtime is unavailable, the request fails instead of silently pretending that local AI succeeded.
- The model can only produce a plan. It cannot bypass Jaslyn's approval or execution controls.
- Model output is parsed as JSON and then validated against Jaslyn's registered tool keys before it can become an AI run.

## Why this integration is intentionally narrow

The value of llamafile for Jaslyn is local/edge inference, not replacing the platform's execution fabric. This keeps sensitive network and subscriber context local when desired while preserving one authoritative execution path for state-changing operations.