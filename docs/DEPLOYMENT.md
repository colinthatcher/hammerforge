# Deploy Hammerforge with Dockhand

Hammerforge is served as static files. The container does not run the development server or its local Steam save-discovery API. No volume or external service is required; builds and saved planner data remain in each visitor's browser.

## Dockhand Git-backed Compose stack

1. In Dockhand, open **Stacks** and choose **Add Stack** (or **Create Stack**).
2. Choose the Git/repository deployment method and enter this repository's Git URL and the branch or tag to deploy. Configure repository credentials in Dockhand if it is private.
3. Set the Compose file to `compose.yaml` and the build context to the repository root (`.`). Do not configure a bind mount or volume.
4. In the stack's environment variables, optionally set `HAMMERFORGE_PORT` to the host port to publish; it defaults to `8080`.
5. Save/deploy the stack and wait for the image build and container to become healthy.
6. Open `http://<server-address>:<HAMMERFORGE_PORT>` (or port `8080` when unset).

Dockhand's Git-backed stack deployment builds the image from the checked-out repository. After pushing an update, use Dockhand's stack update/redeploy action to pull and rebuild it.

## Docker Compose from a checkout

From the repository root, build and start the service:

```sh
docker compose build
docker compose up -d
```

To publish on a different host port, set `HAMMERFORGE_PORT`, for example:

```sh
HAMMERFORGE_PORT=8888 docker compose up -d --build
```

Validate the Compose configuration and container health:

```sh
docker compose config
docker compose ps
curl --fail http://localhost:${HAMMERFORGE_PORT:-8080}/
curl --fail http://localhost:${HAMMERFORGE_PORT:-8080}/data/game-data.json
```

Stop the deployment with `docker compose down`.

## Hosted behavior and access

The import dialog's file and folder pickers work on a hosted copy: select `.hps` files or a saves folder from the device using the browser. The **Find Steam characters on this PC** automatic discovery button does not work on the hosted deployment; it depends on the local-only API provided by `mise run dev`, which is intentionally not included in this container. Saves are read locally by the browser and are not uploaded. Planner builds and settings use browser-local storage, so they are local to that browser/device and are not shared or backed up by the server. Use the app's export/import feature to move builds.

For public or untrusted networks, place the service behind a reverse proxy that provides HTTPS and appropriate access controls. Do not expose the plain HTTP port directly to the public internet when HTTPS is required; configure TLS termination and proxying at the edge.
