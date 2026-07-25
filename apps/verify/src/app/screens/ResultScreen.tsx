import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { VerifyApiResult, SignerPayload } from '@sign-chain/types';
import { verifyDocument, type VerifyState } from '../lib/verify';
import { colors } from '../theme';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ route, navigation }: Props) {
  const { txHashB64, keyB64 } = route.params;
  const [state, setState] = useState<VerifyState>({ status: 'loading' });
  const insets = useSafeAreaInsets();

  useEffect(() => {
    verifyDocument(txHashB64, keyB64).then(setState);
  }, [txHashB64, keyB64]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {state.status === 'loading' && <LoadingCard />}
      {state.status === 'error' && <ErrorCard error={state.error!} />}
      {state.status === 'no-key' && <NoKeyCard result={state.apiResult!} />}
      {state.status === 'verified' && (
        <VerifiedCard result={state.apiResult!} payload={state.signerPayload!} />
      )}

      {state.status !== 'loading' && (
        <TouchableOpacity
          style={styles.scanAgainButton}
          onPress={() => navigation.navigate('Scanner')}
          activeOpacity={0.8}
        >
          <Text style={styles.scanAgainText}>Scan Another Document</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ─── Status icon ─────────────────────────────────────────────────────────────

function StatusIcon({ type }: { type: 'verified' | 'error' | 'partial' }) {
  const config = {
    verified: { bg: colors.green[50], color: colors.green[600], symbol: '✓' },
    error: { bg: colors.red[50], color: colors.red[600], symbol: '✕' },
    partial: { bg: colors.yellow[50], color: colors.yellow[600], symbol: '!' },
  }[type];

  return (
    <View style={[styles.iconCircle, { backgroundColor: config.bg }]}>
      <Text style={[styles.iconSymbol, { color: config.color }]}>{config.symbol}</Text>
    </View>
  );
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <View style={[styles.card, styles.loadingCard]}>
      <ActivityIndicator size="large" color={colors.brand[600]} />
      <Text style={styles.loadingTitle}>Verifying</Text>
      <Text style={styles.loadingSubtitle}>Checking the blockchain…</Text>
    </View>
  );
}

function ErrorCard({ error }: { error: string }) {
  return (
    <View style={styles.card}>
      <StatusIcon type="error" />
      <Text style={styles.statusTitle}>Verification Failed</Text>
      <Text style={styles.statusSubtitle}>{error}</Text>
    </View>
  );
}

function NoKeyCard({ result }: { result: VerifyApiResult }) {
  return (
    <View style={styles.card}>
      <StatusIcon type="partial" />
      <Text style={styles.statusTitle}>Anchored on Blockchain</Text>
      <Text style={styles.statusSubtitle}>
        This document is verified on-chain. The decryption key wasn't included in the QR code, so signer identity cannot be shown.
      </Text>

      <Section title="Blockchain">
        <DetailRow label="Transaction" value={result.txHash} mono />
        <DetailRow label="Composite Hash" value={result.compositeHash} mono />
        <DetailRow
          label="Block Time"
          value={new Date(result.timestamp * 1000).toLocaleString()}
        />
        <DetailRow label="Chain Length" value={`${result.chain.length} signature(s)`} />
      </Section>
    </View>
  );
}

function VerifiedCard({ result, payload }: { result: VerifyApiResult; payload: SignerPayload }) {
  const signerType = payload.s.t === 'company' ? 'Company' : 'Individual';

  return (
    <View style={styles.card}>
      <StatusIcon type="verified" />
      <Text style={styles.statusTitle}>Signature Verified</Text>
      <Text style={styles.statusSubtitle}>
        This document is anchored on the blockchain and the signer's identity has been confirmed.
      </Text>

      <Section title="Signer">
        <DetailRow label="Name" value={payload.s.n} />
        <DetailRow label="Email" value={payload.s.e} />
        <DetailRow label="Type" value={signerType} />
        {payload.s.c ? <DetailRow label="Company" value={payload.s.c} /> : null}
        {payload.s.p ? <DetailRow label="Position" value={payload.s.p} /> : null}
      </Section>

      <Section title="Document">
        <DetailRow label="Hash" value={payload.d} mono />
        <DetailRow
          label="Signed At"
          value={new Date(payload.ts * 1000).toLocaleString()}
        />
        {payload.g ? (
          <DetailRow
            label="Location"
            value={`${payload.g.la.toFixed(4)}, ${payload.g.ln.toFixed(4)}`}
          />
        ) : null}
      </Section>

      <Section title="Blockchain">
        <DetailRow label="Transaction" value={result.txHash} mono />
        <DetailRow label="Composite Hash" value={result.compositeHash} mono />
        <DetailRow label="Chain Length" value={`${result.chain.length} signature(s)`} />
      </Section>
    </View>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, mono ? styles.mono : null]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  content: {
    padding: 20,
    paddingTop: 24,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 52,
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
    marginTop: 20,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: colors.gray[400],
    marginTop: 6,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconSymbol: {
    fontSize: 30,
    fontWeight: '700',
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
    marginBottom: 10,
  },
  statusSubtitle: {
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  sectionBody: {
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  rowLabel: {
    fontSize: 13,
    color: colors.gray[500],
    flexShrink: 0,
    marginRight: 12,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray[900],
    textAlign: 'right',
    flexShrink: 1,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  scanAgainButton: {
    marginTop: 16,
    backgroundColor: colors.brand[600],
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  scanAgainText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
