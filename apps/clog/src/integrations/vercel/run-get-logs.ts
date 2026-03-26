import { Vercel } from '@vercel/sdk';

const vercel = new Vercel({
  bearerToken: process.env.VERCEL_TOKEN,
});

async function getLogsAndStatus() {
  try {
    const logsResponse = await vercel.deployments.getDeploymentEvents({
      idOrUrl: 'project-name-uniqueid.vercel.app',
    });
    if (Array.isArray(logsResponse)) {
      if ('deploymentId' in logsResponse[0]) {
        const deploymentID = logsResponse[0].deploymentId;
        const deploymentStatus = await vercel.deployments.getDeployment({
          idOrUrl: deploymentID,
        });
        console.log(
          `Deployment with id, ${deploymentID} status is ${deploymentStatus.status}`,
        );
      }
      for (const item of logsResponse) {
        if ('text' in item) {
          console.log(
            `${item.type} at ${new Date(item.created).toLocaleTimeString()}: ${
              item.text
            }`,
          );
        }
      }
    }
  } catch (error) {
    console.error(
      error instanceof Error ? `Error: ${error.message}` : String(error),
    );
  }
}

getLogsAndStatus();