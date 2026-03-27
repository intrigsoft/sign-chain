import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { VerifyApiResult, SignerPayload } from '@sign-chain/types';
import { verifyDocument, type VerifyState } from '../lib/verify';
import { colors } from '../theme';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ route, navigation }: Props) {
  const { txHashB64, keyB64 } = route.params;
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    verifyDocument(txHashB64, keyB64).then(setState);
  }, [txHashB64, keyB64]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
    >
      <View style={styles.card}>
        {state.status === 'loading' && <LoadingView />}
        {state.status === 'error' && <ErrorView error={state.error!} />}
        {state.status === 'no-key' && <NoKeyView result={state.apiResult!} />}
        {state.status === 'verified' && (
          <VerifiedView
            result={state.apiResult!}
            payload={state.signerPayload!}
          />
        )}
      </View>

      <TouchableOpacity
        style={styles.scanAgain}
        onPress={() => navigation.navigate('Scanner')}
      >
        <Text style={styles.scanAgainText}>Scan Another</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function LoadingView() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.brand[600]} />
      <Text style={styles.loadingText}>Verifying on blockchain...</Text>
    </View>
  );
}

function ErrorView({ error }: { error: string }) {
  return (
    <View>
      <View style={[styles.badge, { backgroundColor: colors.red[50] }]}>
        <Text style={[styles.badgeText, { color: colors.red[600] }]}>
          Verification Failed
        </Text>
      </View>
      <Text style={styles.description}>{error}</Text>
    </View>
  );
}

function NoKeyView({ result }: { result: VerifyApiResult }) {
  return (
    <View>
      <View style={[styles.badge, { backgroundColor: colors.yellow[50] }]}>
        <Text style={[styles.badgeText, { color: colors.yellow[600] }]}>
          Partial Verification
        </Text>
      </View>
      <Text style={styles.description}>
        This document is anchored on the blockchain, but the decryption key was
        not found in the URL. Signer details cannot be displayed.
      </Text>
      <DetailRow label="Transaction" value={result.txHash} mono />
      <DetailRow label="Composite Hash" value={result.compositeHash} mono />
      <DetailRow
        label="Block Time"
        value={new Date(result.timestamp * 1000).toLocaleString()}
      />
      <DetailRow
        label="Chain Length"
        value={`${result.chain.length} signature(s)`}
      />
    </View>
  );
}

function VerifiedView({
  result,
  payload,
}: {
  result: VerifyApiResult;
  payload: SignerPayload;
}) {
  const signerType = payload.s.t === 'company' ? 'Company' : 'Individual';

  return (
    <View>
      <View style={[styles.badge, { backgroundColor: colors.green[50] }]}>
        <Text style={[styles.badgeText, { color: colors.green[600] }]}>
          Verified
        </Text>
      </View>
      <Text style={styles.description}>
        This document's signature is anchored on the blockchain and the signer
        details have been decrypted successfully.
      </Text>

      <SectionTitle>Signer</SectionTitle>
      <DetailRow label="Name" value={payload.s.n} />
      <DetailRow label="Email" value={payload.s.e} />
      <DetailRow label="Type" value={signerType} />
      {payload.s.c ? <DetailRow label="Company" value={payload.s.c} /> : null}
      {payload.s.p ? <DetailRow label="Position" value={payload.s.p} /> : null}

      <SectionTitle>Document</SectionTitle>
      <DetailRow label="Document Hash" value={payload.d} mono />
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

      <SectionTitle>Blockchain</SectionTitle>
      <DetailRow label="Transaction" value={result.txHash} mono />
      <DetailRow label="Composite Hash" value={result.compositeHash} mono />
      <DetailRow
        label="Chain Length"
        value={`${result.chain.length} signature(s)`}
      />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
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
        style={[styles.rowValue, mono && styles.mono]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  content: {
    padding: 16,
    paddingTop: 24,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  center: {
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: colors.gray[500],
    marginTop: 16,
    fontSize: 14,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontWeight: '600',
    fontSize: 15,
  },
  description: {
    color: colors.gray[500],
    fontSize: 13,
    marginTop: 16,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[700],
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[100],
  },
  rowLabel: {
    fontSize: 13,
    color: colors.gray[500],
    flexShrink: 0,
    marginRight: 12,
  },
  rowValue: {
    fontSize: 13,
    color: colors.gray[900],
    textAlign: 'right',
    flexShrink: 1,
  },
  mono: {
    fontFamily: 'Courier',
  },
  scanAgain: {
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 48,
    backgroundColor: colors.brand[600],
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  scanAgainText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
