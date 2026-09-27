export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, privy-app-id, authorization, privy-client-id'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    let subpath = req.url.replace(/^\/(api\/)?privy-auth/, '');
    if (subpath.startsWith('/')) {
      subpath = subpath.slice(1);
    }
    const targetUrl = `https://auth.privy.io/${subpath}`;

    const headers = { ...req.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers.connection;
    headers.origin = 'https://10k.world';
    headers.referer = 'https://10k.world/';

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || 'application/json';
    const data = await response.text();

    res.setHeader('Content-Type', contentType);
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Privy proxy error:', error);
    res.status(500).json({ error: error.message || 'Internal proxy error' });
  }
}
