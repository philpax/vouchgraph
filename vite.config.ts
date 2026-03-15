import { writeFileSync } from "fs";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import metadata from "./public/client-metadata.json" with { type: "json" };
import { PRODUCTION_BASE_URL } from "./base-url";

function oauthPlugin(): Plugin {
  return {
    name: "vouchgraph-oauth",
    config(_conf, { command }) {
      if (command === "build") {
        process.env.VITE_OAUTH_CLIENT_ID = `${PRODUCTION_BASE_URL}/client-metadata.json`;
        process.env.VITE_OAUTH_REDIRECT_URI = `${PRODUCTION_BASE_URL}/`;
      } else {
        const redirectUri = `http://127.0.0.1:5173${new URL(metadata.redirect_uris[0]).pathname}`;
        process.env.VITE_OAUTH_CLIENT_ID =
          `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&scope=${encodeURIComponent(metadata.scope)}`;
        process.env.VITE_OAUTH_REDIRECT_URI = redirectUri;
      }
      process.env.VITE_OAUTH_SCOPE = metadata.scope;
    },
    transformIndexHtml(html) {
      return html.replaceAll("__BASE_URL__", PRODUCTION_BASE_URL);
    },
    writeBundle() {
      const prodMetadata = {
        client_id: `${PRODUCTION_BASE_URL}/client-metadata.json`,
        client_name: "vouchgraph",
        client_uri: PRODUCTION_BASE_URL,
        redirect_uris: [`${PRODUCTION_BASE_URL}/`],
        scope: metadata.scope,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "web",
        dpop_bound_access_tokens: true,
      };
      writeFileSync(
        resolve(__dirname, "dist/client-metadata.json"),
        JSON.stringify(prodMetadata, null, 2),
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), oauthPlugin()],
});
