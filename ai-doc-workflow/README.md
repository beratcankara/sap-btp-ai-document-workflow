# AI Document Workflow (CAP Node.js)

This project sets up a CAP-based DocumentService secured by XSUAA roles for viewers and uploaders. It includes sample Cloud Foundry descriptors and local bindings so you can validate JWT enforcement and destination usage.

## Services and Authorization
- `DocumentService` exposes the `Documents` entity from `db/schema.cds` with `@restrict` annotations requiring the **Viewer** or **Uploader** roles defined in `xs-security.json`.
- JWT tokens are validated by the XSUAA middleware configured in `server.js` using `@sap/xsenv` and `@sap/xssec`.

## Local Run
1. Install dependencies: `npm install`.
2. Provide local bindings via `default-env.json` (already seeded with sample XSUAA and Destination service credentials and a `sap-mock` destination).
3. Start the service: `npm start`.

## Cloud Foundry Deployment
1. Create service instances:
   - `cf create-service xsuaa application ai-doc-workflow-uaa -c xs-security.json`
   - `cf create-service destination lite ai-doc-workflow-destination`
2. Deploy the app: `cf push` (uses `manifest.yml`).
3. Assign the `Viewer` or `Uploader` role collections mapped to the role templates in `xs-security.json`, then call `DocumentService` endpoints to verify access control.

### CI/CD-friendly steps
Automate `cf push` in a pipeline with the following sequence:

1. **Install dependencies & test:** `npm ci && npm test` in the `ai-doc-workflow` directory.
2. **Authenticate to CF:** `cf login -a <api> -u $CF_USERNAME -p $CF_PASSWORD -o <org> -s <space>` (or use `cf login --sso`).
3. **Create/update bindings (idempotent):**
   ```bash
   cf create-service xsuaa application ai-doc-workflow-uaa -c xs-security.json || cf update-service ai-doc-workflow-uaa -c xs-security.json
   cf create-service destination lite ai-doc-workflow-destination || true
   ```
4. **Push with manifest:** `cf push` (the `manifest.yml` wires the `ai-doc-workflow-uaa` and `ai-doc-workflow-destination` services).
5. **Set environment variables for AI + storage:**
   ```bash
   cf set-env ai-doc-workflow GENAI_API_URL https://<your-genai-endpoint>
   cf set-env ai-doc-workflow GENAI_API_KEY <token>
   cf set-env ai-doc-workflow GENAI_MODEL gpt-4o-mini
   cf set-env ai-doc-workflow DOCUMENT_MAX_SIZE 10485760
   cf set-env ai-doc-workflow ALLOWED_MIME_TYPES "application/pdf,application/vnd.ms-excel"
   ```
   Re-push or restage (`cf restage ai-doc-workflow`) after updates.
6. **Smoke test:** `cf apps` to confirm healthy state, then call `/documents` with an authenticated client.

These steps ensure bindings and environment variables needed by GenAI calls, document storage, and routing rules are consistently applied across pipeline stages.

The default route provides a hello-world CAP service that reflects the configured bindings and role checks once deployed.
