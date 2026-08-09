(function (global) {
  'use strict';

  const DOMAIN_SCHEMA_VERSION = 1;
  const OTP_RESEND_SECONDS = 60;
  const AUTH_REDIRECT_PATH = './';
  const ACCOUNT_AUTH_STORAGE_KEY = 'dye-ledger-account-auth-v1';
  const IDENTITY_PROFILE_SELECT = 'golfer_identity_id,claim_status,claimed_by_account_id,display_name,profile,created_at';

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
      changeEmail() {
        pendingEmail = '';
        resendAvailableAt = 0;
        emit({ status: 'signed-out' });
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

  function createIdentityProfileController({ client, online = () => navigator.onLine } = {}) {
    const requireService = () => {
      if (!online()) throw Object.assign(new Error('You are offline. Local scoring remains available.'), { code: 'OFFLINE' });
      if (!client?.from || !client?.rpc) throw Object.assign(new Error('Golfer Identity service is unavailable. Local scoring remains available.'), { code: 'UNAVAILABLE' });
    };
    const normalizeProfile = row => row ? {
      golferIdentityId: row.golfer_identity_id,
      claimStatus: row.claim_status,
      claimedByAccountId: row.claimed_by_account_id,
      displayName: row.display_name || '',
      nickname: String(row.profile?.nickname || ''),
      createdAt: row.created_at,
    } : null;
    return {
      async load(accountId) {
        requireService();
        if (!String(accountId || '').trim()) throw new Error('A signed-in Account is required.');
        const result = await client.from('golfer_identities')
          .select(IDENTITY_PROFILE_SELECT)
          .eq('claimed_by_account_id', accountId)
          .maybeSingle();
        if (result?.error) throw Object.assign(new Error('Golfer Identity could not be loaded. Local scoring remains available.'), { code: 'PROFILE_UNAVAILABLE' });
        return normalizeProfile(result?.data);
      },
      async create({ accountId, displayName, nickname = '', confirmed = false } = {}) {
        requireService();
        if (!String(accountId || '').trim()) throw new Error('A signed-in Account is required.');
        const name = String(displayName || '').trim().replace(/\s+/g, ' ');
        const preferredName = String(nickname || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 120) throw new Error('Enter your full name.');
        if (preferredName.length > 80) throw new Error('Nickname must be 80 characters or fewer.');
        if (confirmed !== true) throw new Error('Confirm that this permanent Golfer Identity represents you.');
        const result = await client.rpc('create_my_claimed_golfer_identity', {
          p_display_name: name,
          p_nickname: preferredName || null,
        });
        if (result?.error) throw Object.assign(new Error('Golfer Identity could not be created. Nothing on this device was changed.'), { code: 'PROFILE_CREATE_FAILED' });
        const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
        return normalizeProfile(row);
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
      ? (global.__DYE_SUPABASE_CLIENT__ || (global.__DYE_SUPABASE_CLIENT__ = global.supabase.createClient(config.url, config.anonKey, { auth: { storageKey: ACCOUNT_AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: { headers: { 'X-Client-Info': 'the-dye-ledger-account-v30.3.95' } } })))
      : null;
    const controller = createAuthController({ client });
    const profileController = createIdentityProfileController({ client });
    let view = controller.getState();
    let profileAccountId = '';
    let profileRequest = 0;
    let resendTimer = null;
    const loadProfile = async user => {
      const accountId = String(user?.id || '');
      if (!accountId || profileAccountId === accountId) return;
      profileAccountId = accountId;
      const request = ++profileRequest;
      render({ profileLoading: true, profile: null, profileError: '' });
      try {
        const profile = await profileController.load(accountId);
        if (request === profileRequest) render({ profileLoading: false, profile, profileError: '' });
      } catch (error) {
        if (request === profileRequest) render({ profileLoading: false, profile: null, profileError: error.message });
      }
    };
    const scheduleResendCountdown = () => {
      const button = root.querySelector('#accountResendOtpBtn');
      if (!button) return;
      const seconds = Math.max(0, Math.ceil((Number(view.resendAvailableAt) - Date.now()) / 1000));
      button.disabled = seconds > 0;
      button.textContent = seconds > 0 ? `Resend in ${seconds}s` : 'Resend code';
      if (seconds > 0) resendTimer = setTimeout(scheduleResendCountdown, 1000);
    };
    const render = state => {
      if (resendTimer) { clearTimeout(resendTimer); resendTimer = null; }
      view = { ...view, ...state };
      const user = view.session?.user;
      const resendSecondsRemaining = Math.max(0, Math.ceil((Number(view.resendAvailableAt) - Date.now()) / 1000));
      root.innerHTML = !gate.enabled
        ? `<h2>Account &amp; Security</h2><div class="strong">Account sign-in unavailable</div><div class="tiny top-gap">${escapeText(gate.reason)} Local scoring remains available.</div>`
        : user && view.profileLoading
        ? `<h2>Account &amp; Security</h2><div class="strong">Signed in</div><div class="tiny top-gap">Checking your Golfer Identity… Local scoring remains available.</div><div id="accountFeedback" class="tiny top-gap" role="status" aria-live="polite"></div>`
        : user && view.profile
        ? `<h2>Account &amp; Security</h2><div class="strong">Signed in</div><div class="tiny top-gap">${escapeText(user.email || 'Authenticated Account')}</div><div class="account-identity-summary top-gap"><div class="tiny">Your permanent Golfer Identity</div><div class="strong">${escapeText(view.profile.displayName)}</div>${view.profile.nickname ? `<div class="tiny">Preferred name: ${escapeText(view.profile.nickname)}</div>` : ''}</div><div class="tiny top-gap">Your existing local rounds stay on this device. Signing in does not upload, claim, merge, rewrite, or delete them.</div><div class="actions top-gap"><button id="accountSignOutBtn" type="button" class="secondary">Sign out</button></div><div id="accountFeedback" class="tiny top-gap" role="status" aria-live="polite"></div>`
        : user
        ? `<h2>Account &amp; Security</h2><div class="strong">Create your Golfer Identity</div><div class="tiny top-gap">This creates the permanent identity that represents you. Your name, email, nickname, phone, and future GHIN details can change; none of them is used to merge identities.</div>${view.profileError ? `<div class="notice warning top-gap" role="status">${escapeText(view.profileError)}</div>` : ''}<form id="accountIdentityForm" class="grid top-gap"><label><span>Full name</span><input id="accountIdentityName" type="text" autocomplete="name" maxlength="120" required /></label><label><span>Nickname <span class="tiny">(optional)</span></span><input id="accountIdentityNickname" type="text" maxlength="80" /></label><label class="account-identity-confirm"><input id="accountIdentityConfirm" type="checkbox" required /><span>I confirm this permanent Golfer Identity represents me.</span></label><button type="submit">Create my Golfer Identity</button></form><div class="tiny top-gap">This will not connect or upload existing players or rounds on this device.</div><div class="actions top-gap"><button id="accountSignOutBtn" type="button" class="secondary">Sign out</button></div><div id="accountFeedback" class="tiny top-gap" role="status" aria-live="polite"></div>`
        : view.pendingEmail
        ? `<h2>Account &amp; Security</h2><div class="strong">Check your email</div><div class="tiny top-gap">Enter the six-digit code sent to <strong>${escapeText(view.pendingEmail)}</strong>.</div><form id="accountOtpForm" class="grid top-gap"><label><span>Six-digit code</span><input id="accountOtp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus /></label><button type="submit">Verify code</button></form><div class="actions wrap top-gap"><button id="accountChangeEmailBtn" type="button" class="secondary">Change email</button><button id="accountResendOtpBtn" type="button" class="secondary" ${resendSecondsRemaining > 0 ? 'disabled' : ''}>${resendSecondsRemaining > 0 ? `Resend in ${resendSecondsRemaining}s` : 'Resend code'}</button></div><div id="accountFeedback" class="tiny top-gap" role="status" aria-live="polite">${navigator.onLine ? 'Code sent. The address will remain here until you sign in or change it.' : 'Offline. Local scoring remains available; verify when connected.'}</div>`
        : `<h2>Account &amp; Security</h2><div class="tiny">Sign in with a six-digit email code. Local scoring does not require an account.</div><form id="accountEmailForm" class="grid top-gap"><label><span>Email</span><input id="accountEmail" type="email" autocomplete="email" inputmode="email" required /></label><button type="submit">Email me a code</button></form><div id="accountFeedback" class="tiny top-gap" role="status" aria-live="polite">${navigator.onLine ? 'Signed out.' : 'Offline. Local scoring remains available; sign in when connected.'}</div>`;
      bind();
      if (!user && view.pendingEmail) scheduleResendCountdown();
    };
    const feedback = message => { const el = root.querySelector('#accountFeedback'); if (el) el.textContent = message; };
    const busy = value => root.querySelectorAll('button,input').forEach(el => { el.disabled = value; });
    const bind = () => {
      root.querySelector('#accountChangeEmailBtn')?.addEventListener('click', () => controller.changeEmail());
      root.querySelector('#accountResendOtpBtn')?.addEventListener('click', async () => { busy(true); feedback('Sending a new code...'); try { await controller.requestOtp(view.pendingEmail); render(controller.getState()); feedback('A new code was sent.'); } catch (error) { feedback(error.message); busy(false); } });
      root.querySelector('#accountEmailForm')?.addEventListener('submit', async event => { event.preventDefault(); busy(true); feedback('Sending code…'); try { await controller.requestOtp(root.querySelector('#accountEmail').value); render(controller.getState()); feedback('Code sent. Check your email. You can request another code in one minute.'); } catch (error) { feedback(error.message); busy(false); } });
      root.querySelector('#accountOtpForm')?.addEventListener('submit', async event => { event.preventDefault(); busy(true); feedback('Verifying…'); try { await controller.verifyOtp(root.querySelector('#accountOtp').value); } catch (error) { feedback(error.message); busy(false); } });
      root.querySelector('#accountIdentityForm')?.addEventListener('submit', async event => { event.preventDefault(); busy(true); feedback('Creating your Golfer Identity…'); try { const profile = await profileController.create({ accountId: view.session?.user?.id, displayName: root.querySelector('#accountIdentityName').value, nickname: root.querySelector('#accountIdentityNickname').value, confirmed: root.querySelector('#accountIdentityConfirm').checked }); render({ profile, profileLoading: false, profileError: '' }); feedback('Your Golfer Identity is ready. Existing local rounds remain unchanged.'); } catch (error) { feedback(error.message); busy(false); } });
      root.querySelector('#accountSignOutBtn')?.addEventListener('click', async () => { busy(true); try { await controller.signOut(); } catch { feedback('Sign-out could not reach the service. Try again when connected.'); busy(false); } });
    };
    const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    controller.subscribe(state => {
      if (!state.session?.user) { profileAccountId = ''; profileRequest += 1; state = { ...state, profile: null, profileLoading: false, profileError: '' }; }
      render(state);
      if (state.session?.user) void loadProfile(state.session.user);
    });
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
    createAmendment, createAuthController, createIdentityProfileController, mountAccountSecurity,
  });
})(typeof window === 'undefined' ? globalThis : window);
