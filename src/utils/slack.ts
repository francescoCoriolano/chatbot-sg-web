import crypto from 'crypto';

export async function verifySlackRequest(req: Request, rawBody: string): Promise<boolean> {
  try {
    // Check if we're in development mode and no signing secret is set
    if (process.env.NODE_ENV === 'development' && !process.env.SLACK_SIGNING_SECRET) {
      console.warn('SLACK_SIGNING_SECRET not set in development mode, skipping verification');
      return true;
    }

    const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
    if (!slackSigningSecret) {
      console.error('SLACK_SIGNING_SECRET is not set');
      return false;
    }

    // Get the Slack signature and timestamp
    const slackSignature = req.headers.get('x-slack-signature');
    const slackTimestamp = req.headers.get('x-slack-request-timestamp');

    if (!slackSignature || !slackTimestamp) {
      console.error('Missing Slack signature headers');
      return false;
    }

    // Check for replay attacks - reject requests older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(slackTimestamp)) > 300) {
      console.error('Slack request timestamp is too old');
      return false;
    }

    // Create a signature using our signing secret
    const sigBasestring = `v0:${slackTimestamp}:${rawBody}`;
    const mySignature =
      'v0=' +
      crypto.createHmac('sha256', slackSigningSecret).update(sigBasestring, 'utf8').digest('hex');

    // Compare signatures
    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
  } catch (error) {
    console.error('Error verifying Slack request:', error);
    return false;
  }
}
