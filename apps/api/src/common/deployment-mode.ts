export type DeploymentMode = "self-hosted" | "organization";

export function getDeploymentMode(): DeploymentMode {
  const raw = process.env.DEPLOYMENT_MODE ?? "organization";
  return raw === "self-hosted" ? "self-hosted" : "organization";
}

export function isSelfHosted(): boolean {
  return getDeploymentMode() === "self-hosted";
}

export function isOrganizationMode(): boolean {
  return getDeploymentMode() === "organization";
}
