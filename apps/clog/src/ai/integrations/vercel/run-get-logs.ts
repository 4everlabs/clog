const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim();
const token = process.env.VERCEL_TOKEN?.trim();

if (!deploymentId || !token) {
  process.stderr.write("Set VERCEL_DEPLOYMENT_ID and VERCEL_TOKEN before running this example.\n");
  process.exitCode = 1;
} else {
  const response = await fetch(
    `https://api.vercel.com/v2/deployments/${encodeURIComponent(deploymentId)}/events`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  const body = await response.text();
  process.stdout.write(`${body}\n`);
}
