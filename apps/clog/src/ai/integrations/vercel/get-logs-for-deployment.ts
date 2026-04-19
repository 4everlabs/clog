const response = await fetch('https://api.vercel.com/v1/projects/projectId/deployments/deploymentId/runtime-logs?teamId=string&slug=string', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
      'Content-Type': 'application/json',
    },
  });
  
await response.json();