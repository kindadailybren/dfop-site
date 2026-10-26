const TOKEN_STORAGE_KEY = 'dfop_admin_token';
const USER_STORAGE_KEY = 'dfop_admin_user';

export interface AdminUserSession {
  username: string;
  idToken: string;
  isCognito: boolean;
}

export function getSavedAdminSession(): AdminUserSession | null {
  try {
    const rawUser = sessionStorage.getItem(USER_STORAGE_KEY);
    const rawToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!rawUser || !rawToken) return null;
    const parsed = JSON.parse(rawUser) as { username: string; isCognito: boolean };
    return {
      username: parsed.username,
      idToken: rawToken,
      isCognito: parsed.isCognito,
    };
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
}

export async function signInAdmin(
  username: string,
  password: string
): Promise<AdminUserSession> {
  const clientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID as
    | string
    | undefined;
  const region =
    (import.meta.env.VITE_AWS_REGION as string | undefined) || 'ap-southeast-1';

  if (clientId) {
    const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: {
          USERNAME: username.trim(),
          PASSWORD: password,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data?.message || data?.__type || 'Cognito authentication failed.'
      );
    }

    const idToken: string | undefined =
      data?.AuthenticationResult?.IdToken ||
      data?.AuthenticationResult?.AccessToken;

    if (!idToken) {
      throw new Error(
        data?.ChallengeName
          ? `Cognito challenge required: ${data.ChallengeName}. Complete password setup first.`
          : 'No token returned by Cognito.'
      );
    }

    const session: AdminUserSession = {
      username: username.trim(),
      idToken,
      isCognito: true,
    };
    sessionStorage.setItem(TOKEN_STORAGE_KEY, idToken);
    sessionStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({ username: session.username, isCognito: true })
    );
    return session;
  }

  // Local / preview development mode when VITE_COGNITO_USER_POOL_CLIENT_ID is not set
  if (!username.trim() || password.length < 4) {
    throw new Error('Enter your admin username and password.');
  }

  const localSession: AdminUserSession = {
    username: username.trim(),
    idToken: 'local-dev-admin-token',
    isCognito: false,
  };
  sessionStorage.setItem(TOKEN_STORAGE_KEY, localSession.idToken);
  sessionStorage.setItem(
    USER_STORAGE_KEY,
    JSON.stringify({ username: localSession.username, isCognito: false })
  );
  return localSession;
}
