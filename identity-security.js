(function (global) {
  'use strict';

  const DOMAIN_SCHEMA_VERSION = 1;
  const OTP_RESEND_SECONDS = 60;
  const AUTH_REDIRECT_PATH = './';
  const ACCOUNT_AUTH_STORAGE_KEY = 'dye-ledger-account-auth-v1';

  function getProjectRef(url) {
    try {
      const host = new URL(String(url || '')).hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return 'local';
      const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
      return match?.[1] || '';
    } catch { return ''; }
  }

  function isDurableAccountSession(session) {
    const user = session?.user;
    return !!user && user.is_anonymous !== true && user.app_metadata?.provider !== 'anonymous';
  }

  function getAccountAuthGate(config = {}) {
    const settings = config.accountAuth || {};
    const actualProjectRef = getProjectRef(config.url);
    const expectedProjectRef = String(settings.expectedProjectRef || '').trim().toLowerCase();
    const environment = String(settings.environment || '').trim().toLowerCase();
    const enabled = settings.enabled === true;
    const allowedEnvironment = ['local', 'test', 'staging', 'production'].includes(environment);
    const projectMatches = !!expectedProjectRef && actualProjectRef === expectedProjectRef;
    const environmentMatchesProject = actualProjectRef === 'local' ? environment === 'local' : environment !== 'local';
    return {
      enabled: enabled && allowedEnvironment && projectMatches && environmentMatchesProject,
      environment,
      expectedProjectRef,
      actualProjectRef,
      reason: !enabled ? 'Account sign-in is disabled for this build.'
        : !allowedEnvironment ? 'Account sign-in environment is not explicitly approved.'
        : !projectMatches || !environmentMatchesProject ? 'Account sign-in project does not match the approved environment.' : '',
    };
  }

  function id(prefix, cryptoLike = global.crypto) {
    if (!cryptoLike?.randomUUID) throw new Error('Secure UUID generation is required.');
    const value = cryptoLike.randomUUID();
    return `${prefix}_${value}`;
  }

  function createGolferIdentity(attributes = {}, options = {}) {
    if (!global.crypto?.randomUUID && !options.crypto?.randomUUID) throw new Error('Secure UUID generation is required.');
    if (options.claimStatus === 'claimed' && !String(options.claimedByAccountId || '').trim()) throw new Error('A claimed Golfer Identity requires an Account.');
    return {
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      golferIdentityId: options.golferIdentityId || id('golfer', options.crypto),
      claimStatus: options.claimStatus === 'claimed' ? 'claimed' : 'unclaimed',
      claimedByAccountId: options.claimStatus === 'claimed' ? String(options.claimedByAccountId || '') : null,
      profile: { ...attributes },
      createdAt: options.createdAt || new Date().toISOString(),
    };
  }

  function addGolferToLibrary(accountId, golferIdentityId, preferences = {}, options = {}) {
    if (!accountId || !golferIdentityId) throw new Error('Account and Golfer Identity are required.');
    return {
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      personalGolferLibraryEntryId: options.entryId || id('library', options.crypto),
      accountId: String(accountId),
      golferIdentityId: String(golferIdentityId),
      preferences: { ...preferences },
      createdAt: options.createdAt || new Date().toISOString(),
    };
  }

  function createRoundAccess({ roundId, accountId, role }) {
    if (!['owner', 'participant', 'viewer'].includes(role)) throw new Error('Invalid Round role.');
    return { roundId: String(roundId), accountId: String(accountId), role };
  }

  function createRoundParticipation({ roundId, golferIdentityId, snapshot = {}, participationId }) {
    return {
      participationId: participationId || id('participation'),
      roundId: String(roundId),
      golferIdentityId: String(golferIdentityId),
      historicalSnapshot: { ...snapshot },
      permanent: true,
    };
  }

  function createScoringAssignment({ roundId, participationId, deviceId, capability = 'score' }) {
    return { assignmentId: id('assignment'), roundId, participationId, deviceId, capability };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function createRoundRecordVersion({ authoritativeRoundId, version = 1, record, priorVersionId = null, actorAccountId, reason = 'initial publication', impact = 'initial' }) {
    if (!authoritativeRoundId || !actorAccountId || !record) throw new Error('Round, actor, and record are required.');
    const immutableRecord = deepFreeze(JSON.parse(JSON.stringify(record)));
    return Object.freeze({
      roundRecordVersionId: id('round_record_version'), authoritativeRoundId,
      version, priorVersionId, record: immutableRecord, actorAccountId, reason, impact,
      publishedAt: new Date().toISOString(),
    });
  }

  function createAmendment({ authoritativeRoundId, baseVersionId, proposedByAccountId, reason, impact = 'non_material' }) {
    if (!reason?.trim()) throw new Error('Amendment reason is required.');
    return {
      amendmentSessionId: id('amendment'), authoritativeRoundId, baseVersionId,
      proposedByAccountId, reason: reason.trim(), impact, status: 'proposed',
      createdAt: new Date().toISOString(),
    };
  }

  function createAuthController({ client, online = () => navigator.onLine, now = () => Date.now(), resendSeconds = OTP_RESEND_SECONDS, redirectUrl = () => new URL(AUTH_REDIRECT_PATH, location.href).href } = {}) {
    let session = null;
    let pendingEmail = '';
    let resendAvailableAt = 0;
    const listeners = new Set();
    const snapshot = (extra = {}) => ({ session, pendingEmail, resendAvailableAt, ...extra });
    const emit = extra => listeners.forEach(listener => listener(snapshot(extra)));
    const requireService = () => {
      if (!online()) throw Object.assign(new Error('You are offline. Local scoring remains available.'), { code: 'OFFLINE' });
      if (!client?.auth) throw Object.assign(new Error('Account service is unavailable. Local scoring remains available.'), { code: 'UNAVAILABLE' });
    };
    return {
      subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
      getState() { return snapshot(); },
      async restore() {
        if (!client?.auth) return emit({ status: 'unavailable' });
        try {
          const result = await client.auth.getSession();
          session = isDurableAccountSession(result?.data?.session) ? result.data.session : null;
          emit({ status: session ? 'signed-in' : 'signed-out' });
          return session;
        } catch { emit({ status: 'unavailable' }); return null; }
      },
      async requestOtp(email) {
        requireService();
        const normalized = String(email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error('Enter a valid email address.');
        if (now() < resendAvailableAt) throw Object.assign(new Error('Please wait before requesting another code.'), { code: 'THROTTLED', retryAt: resendAvailableAt });
        const result = await client.auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() } });
        if (result?.error) throw new Error('We could not send a code. Check your connection and try again.');
        pendingEmail = normalized;
        resendAvailableAt = now() + resendSeconds * 1000;
        emit({ status: 'code-sent' });
      },
      async verifyOtp(token) {
        requireService();
        if (!pendingEmail) throw new Error('Request a new code first.');
        const code = String(token || '').replace(/\D/g, '');
        if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit code.');
        const result = await client.auth.verifyOtp({ email: pendingEmail, token: code, type: 'email' });
        if (result?.error) throw new Error('That code is invalid or expired. Request a new code and try again.');
        session = isDurableAccountSession(result?.data?.session) ? result.data.session : null;
        if (!session) throw new Error('Account verification did not create a durable session. Request a new code and try again.');
        pendingEmail = '';
        emit({ status: 'signed-in' });
        return session;
      },
      async signOut() {
        if (client?.auth && session) {
          const result = await client.auth.signOut({ scope: 'local' });
          if (result?.error) throw result.error;
        }
        session = null; pendingEmail = ''; emit({ status: 'signed-out' });
      },
      handleAuthSession(nextSession) {
        session = isDurableAccountSession(nextSession) ? nextSession : null;
        emit({ status: session ? 'signed-in' : 'signed-out' });
      },
    };
  }

  function mountAccountSecurity() {
    const root = document.getElementById('accountSecurityPanel');
    if (!root || root.dataset.accountSecurityMounted === 'true') return;
    root.dataset.accountSecurityMounted = 'true';
    const config = global.__DYE_SUPABASE_CONFIG__ || {};
    const gate = getAccountAuthGate(config);
    const client = gate.enabled && config.url && config.anonKey && global.supabase?.createClient
      ? global.supabase.createClient(config.url, config.anonKey, { auth: { storageKey: ACCOUNT_AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: { headers: { 'X-Client-Info': 'the-dye-ledger-account-v30.3.75' } } })
      : null;
    const controller = createAuthController({ client });
    let view = controller.getState();
    const render = state => {
      view = { ...view, ...state };
      const user = view.session?.user;
      root.innerHTML = !gate.enabled
        ? `<h2>Account &amp; Security</h2><div class="strong">Account sign-in unavailable</div><div class="tiny top-gap">${escapeText(gate.reason)} Local scoring remains available.</div>`
        : user
        ? `<h2>Account &amp; Security</h2><div class="strong">Signed in</div><div class="tiny top-gap">${escapeText(user.email || 'Authenticated account')}</div><div class="tiny top-gap">Your existing local rounds stay on this device unless you explicitly choose a future cloud action.</div><div class="actions top-gap"><button id="accountSignOutBtn" type="button" class="secondary">Sign out</button></div><div id="accountFeedback" class="tiny top-gap" role="status" aria-live="polite"></div>`
        : `<h2>Account &amp; Security</h2><div class="tiny">Sign in with a six-digit email code. Local scoring does not require an account.</div><form id="accountEmailForm" class="grid top-gap"><label><span>Email</span><input id="accountEmail" type="email" autocomplete="email" inputmode="email" required /></label><button type="submit">Email me a code</button></form><form id="accountOtpForm" class="grid top-gap ${view.pendingEmail ? '' : 'hidden'}"><label><span>Six-digit code</span><input id="accountOtp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required /></label><button type="submit">Verify code</button></form><div id="accountFeedback" class="tiny top-gap" role="status" aria-live="polite">${navigator.onLine ? 'Signed out.' : 'Offline. Local scoring remains available; sign in when connected.'}</div>`;
      bind();
    };
    const feedback = message => { const el = root.querySelector('#accountFeedback'); if (el) el.textContent = message; };
    const busy = value => root.querySelectorAll('button,input').forEach(el => { el.disabled = value; });
    const bind = () => {
      root.querySelector('#accountEmailForm')?.addEventListener('submit', async event => { event.preventDefault(); busy(true); feedback('Sending code…'); try { await controller.requestOtp(root.querySelector('#accountEmail').value); render(controller.getState()); feedback('Code sent. Check your email. You can request another code in one minute.'); } catch (error) { feedback(error.message); busy(false); } });
      root.querySelector('#accountOtpForm')?.addEventListener('submit', async event => { event.preventDefault(); busy(true); feedback('Verifying…'); try { await controller.verifyOtp(root.querySelector('#accountOtp').value); } catch (error) { feedback(error.message); busy(false); } });
      root.querySelector('#accountSignOutBtn')?.addEventListener('click', async () => { busy(true); try { await controller.signOut(); } catch { feedback('Sign-out could not reach the service. Try again when connected.'); busy(false); } });
    };
    const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    controller.subscribe(render);
    if (client) {
      client.auth.onAuthStateChange((_event, nextSession) => controller.handleAuthSession(nextSession));
      controller.restore();
    }
    global.addEventListener('online', () => feedback('Connection restored. You can sign in.'));
    global.addEventListener('offline', () => feedback('Offline. Local scoring remains available.'));
  }

  global.DyeLedgerIdentitySecurity = Object.freeze({
    DOMAIN_SCHEMA_VERSION, ACCOUNT_AUTH_STORAGE_KEY, getProjectRef, getAccountAuthGate, isDurableAccountSession,
    createGolferIdentity, addGolferToLibrary, createRoundAccess,
    createRoundParticipation, createScoringAssignment, createRoundRecordVersion,
    createAmendment, createAuthController, mountAccountSecurity,
  });
})(typeof window === 'undefined' ? globalThis : window);
