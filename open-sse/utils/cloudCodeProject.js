// Project binding is account provisioning data, never a client-supplied or
// generated routing identifier. Pure translation can omit it; dispatch cannot.
export function readCloudCodeProjectId(credentials) {
  const projectId = credentials?.projectId;
  return typeof projectId === "string" && projectId.length > 0 && !/\s/.test(projectId)
    ? projectId : undefined;
}

export function requireCloudCodeProjectId(credentials) {
  const projectId = readCloudCodeProjectId(credentials);
  if (projectId) return projectId;
  const error = new Error("This connection has no provisioned Cloud Code project. Reconnect the account or finish its supported project onboarding before retrying; the gateway will not invent a project binding.");
  error.code = "provider_project_required";
  error.param = "project";
  throw error;
}
