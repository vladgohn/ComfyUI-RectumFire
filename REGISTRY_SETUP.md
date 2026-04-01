# Comfy Registry Setup

This file contains the exact remaining steps that require user interaction on the registry / GitHub website.

## Current Repo State

Already prepared locally:
- `pyproject.toml`
- `.github/workflows/publish_action.yml`

That means the repository is ready for registry publishing as soon as you create the publisher and API key.

## Step 1: Create your publisher

Open:

- [https://registry.comfy.org](https://registry.comfy.org)

What to do:

1. Sign in.
2. Create a publisher.
3. If the site lets you choose the publisher id, use:
   - `vladgohn`
4. Finish creation.

Important:
- the publisher id becomes part of the node URL
- changing it later is not the thing to plan around

## Step 2: Verify your publisher id

After publisher creation:

1. Open your profile page on the registry.
2. Look at the `@publisher-id` part.
3. Confirm whether it is exactly:
   - `vladgohn`

If it is different:
- tell me the exact publisher id
- I will update `pyproject.toml`

## Step 3: Create the publishing API key

Open:

- [https://registry.comfy.org](https://registry.comfy.org)

What to do:

1. Click your publisher.
2. Create a publishing API key for that publisher.
3. Give it a simple name like:
   - `github-actions`
4. Copy the key immediately and save it.

Important:
- this is the key used for publishing to the registry and ComfyUI-Manager

## Step 4: Add the key to GitHub Secrets

Open:

- [https://github.com/vladgohn/ComfyUI-RectumFire/settings/secrets/actions](https://github.com/vladgohn/ComfyUI-RectumFire/settings/secrets/actions)

What to do:

1. Click `New repository secret`
2. Name:
   - `REGISTRY_ACCESS_TOKEN`
3. Paste the API key as the value
4. Save

## Step 5: Trigger the first publish

After the secret is added, there are two ways to publish.

### Option A: manual workflow run

Open:

- [https://github.com/vladgohn/ComfyUI-RectumFire/actions](https://github.com/vladgohn/ComfyUI-RectumFire/actions)

What to do:

1. Open `Publish to Comfy registry`
2. Click `Run workflow`
3. Run it on `main`

### Option B: version bump push

Change the version in `pyproject.toml`, commit, and push.
The workflow will auto-run because it watches that file on `main`.

## Step 6: Confirm the package is live

After publish succeeds:

1. Open the registry
2. Search for:
   - `rectumfire`
3. Confirm the node pack appears in search / manager
