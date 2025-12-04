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

The default route provides a hello-world CAP service that reflects the configured bindings and role checks once deployed.
