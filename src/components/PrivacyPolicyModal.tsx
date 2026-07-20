import React from 'react';

const NAVY = '#143A63';

type Tab = 'privacy' | 'terms';

interface Props {
  onClose: () => void;
  initialTab?: Tab;
}

/**
 * PrivacyPolicyModal
 * Full-screen bottom-sheet modal showing Privacy Policy and Terms of Service.
 * Linked from LoginScreenWeb, the Settings panel, and the footer.
 */
export default function PrivacyPolicyModal({ onClose, initialTab = 'privacy' }: Props) {
  const [tab, setTab] = React.useState<Tab>(initialTab);

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={tab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="anp-modal-in" style={styles.sheet}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.tabRow}>
            <button
              style={{ ...styles.tabBtn, ...(tab === 'privacy' ? styles.tabActive : {}) }}
              onClick={() => setTab('privacy')}
            >
              Privacy Policy
            </button>
            <button
              style={{ ...styles.tabBtn, ...(tab === 'terms' ? styles.tabActive : {}) }}
              onClick={() => setTab('terms')}
            >
              Terms of Service
            </button>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Content */}
        <div style={styles.body}>
          {tab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        </div>
      </div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div style={styles.content}>
      <p style={styles.updated}>Last updated: July 2026</p>

      <Section title="1. Information We Collect">
        <p>We collect only the minimum information needed to provide the service:</p>
        <ul>
          <li><strong>Email address</strong> — provided voluntarily when you sign in. Used solely to identify your account and sync your data across devices.</li>
          <li><strong>Survey data</strong> — points, sets, rod readings, and calculations you create. Stored locally on your device and, if Firebase is configured, synced to your private cloud account.</li>
          <li><strong>Language preference</strong> — stored locally on your device only.</li>
        </ul>
        <p>Guest users: no email is collected. All data is stored on-device only.</p>
      </Section>

      <Section title="2. How We Use Your Information">
        <ul>
          <li>To sync your survey data across your devices.</li>
          <li>To restore your data when you log in on a new device.</li>
          <li>We do not sell, rent, or share your data with third parties for marketing purposes.</li>
        </ul>
      </Section>

      <Section title="3. Data Storage">
        <p>Your data is stored in two places:</p>
        <ul>
          <li><strong>Your device</strong> — via browser localStorage. Data persists unless you clear your browser data.</li>
          <li><strong>Firebase Firestore</strong> (signed-in users) — Google's cloud database, hosted in the United States. Governed by Google's Privacy Policy.</li>
        </ul>
      </Section>

      <Section title="4. Data Security">
        <p>
          All data transmitted to Firebase is sent over HTTPS (TLS). Access requires a valid Firebase
          Authentication session. We do not store passwords — authentication is email-based.
        </p>
      </Section>

      <Section title="5. Data Deletion">
        <p>
          To delete your account and all associated data, contact us at the email below. Guest users
          can clear their data by clearing browser storage in their device settings.
        </p>
      </Section>

      <Section title="6. Children's Privacy">
        <p>
          This app is intended for use by construction and survey professionals. We do not knowingly
          collect data from children under 13.
        </p>
      </Section>

      <Section title="7. Changes to This Policy">
        <p>
          We may update this policy from time to time. Continued use of the app after changes
          constitutes acceptance of the updated policy.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          For privacy questions or data deletion requests, contact:<br />
          <strong>Bright Sky Construction</strong><br />
          Email: support@brightskyconstruction.com
        </p>
      </Section>
    </div>
  );
}

function TermsContent() {
  return (
    <div style={styles.content}>
      <p style={styles.updated}>Last updated: July 2026</p>

      <Section title="1. Acceptance of Terms">
        <p>
          By using Grade and Elevation Calculator ("the App"), you agree to these Terms of Service.
          If you do not agree, do not use the App.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          The App provides elevation and grade calculation tools for construction and surveying
          professionals. It is provided "as is" for informational and field-use purposes.
        </p>
      </Section>

      <Section title="3. Accuracy Disclaimer">
        <p>
          Calculations are based on the data you input. <strong>Always verify results with a licensed
          surveyor before making structural or engineering decisions.</strong> We are not liable for
          errors resulting from incorrect input data or misuse of calculated values.
        </p>
      </Section>

      <Section title="4. User Responsibilities">
        <ul>
          <li>You are responsible for the accuracy of data you enter.</li>
          <li>Do not use the App for safety-critical applications without independent verification.</li>
          <li>You must be 13 or older to create an account.</li>
        </ul>
      </Section>

      <Section title="5. Intellectual Property">
        <p>
          All content, design, and code in the App are owned by Bright Sky Construction.
          You may not copy, modify, or redistribute any part of the App without written permission.
        </p>
      </Section>

      <Section title="6. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, Bright Sky Construction is not liable for any
          direct, indirect, incidental, or consequential damages arising from your use of the App,
          including data loss, construction errors, or financial loss.
        </p>
      </Section>

      <Section title="7. Service Availability">
        <p>
          We may modify, suspend, or discontinue the service at any time without notice.
          Your locally stored data remains yours even if the service is discontinued.
        </p>
      </Section>

      <Section title="8. Governing Law">
        <p>
          These terms are governed by the laws of the State of Georgia, United States,
          without regard to conflict of law provisions.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          For questions about these terms:<br />
          <strong>Bright Sky Construction</strong><br />
          Email: support@brightskyconstruction.com
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    backgroundColor: 'rgba(0,0,0,0.60)',
    display:         'flex',
    alignItems:      'flex-end',
    justifyContent:  'center',
    zIndex:          6000,
    padding:         '0',
    boxSizing:       'border-box',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius:    '20px 20px 0 0',
    width:           '100%',
    maxWidth:        480,
    maxHeight:       '90vh',
    display:         'flex',
    flexDirection:   'column',
    overflow:        'hidden',
    boxShadow:       '0 -8px 40px rgba(0,0,0,0.25)',
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '16px 16px 0',
    backgroundColor: NAVY,
    flexShrink:      0,
    gap:             8,
  },
  tabRow: {
    display:        'flex',
    flex:           1,
    gap:            4,
  },
  tabBtn: {
    height:          38,
    flex:            1,
    border:          'none',
    borderRadius:    '8px 8px 0 0',
    backgroundColor: 'rgba(255,255,255,0.12)',
    color:           'rgba(255,255,255,0.65)',
    fontSize:        13,
    fontWeight:      700,
    cursor:          'pointer',
    transition:      'background-color 0.15s, color 0.15s',
    letterSpacing:   0.2,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    color:           NAVY,
  },
  closeBtn: {
    width:           36,
    height:          36,
    border:          'none',
    background:      'rgba(255,255,255,0.12)',
    color:           '#FFFFFF',
    fontSize:        18,
    fontWeight:      700,
    cursor:          'pointer',
    borderRadius:    8,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  body: {
    flex:       1,
    overflowY:  'auto',
    padding:    '20px 20px 32px',
    WebkitOverflowScrolling: 'touch',
  } as React.CSSProperties,
  content: {
    fontSize:   14,
    color:      '#374151',
    lineHeight: 1.6,
    fontFamily: 'inherit',
  },
  updated: {
    fontSize:    12,
    color:       '#9CA3AF',
    marginBottom: 20,
    fontWeight:  500,
  },
  sectionTitle: {
    fontSize:    14,
    fontWeight:  800,
    color:       NAVY,
    marginBottom: 6,
    letterSpacing: '-0.1px',
    fontFamily:  'inherit',
  },
  sectionBody: {
    fontSize:   14,
    color:      '#374151',
    lineHeight: 1.65,
  },
};
