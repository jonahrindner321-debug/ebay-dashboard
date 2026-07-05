#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { buildSnapshot } = require('../api/_lib/snapshot-builder');
const {
  serviceAccountFromEnv,
  snapshotSpreadsheetId,
  snapshotTab,
  writeSnapshotToSheet,
} = require('../api/_lib/google-sheets');

async function main() {
  const outputFile = process.env.SNAPSHOT_OUTPUT_FILE || '';
  const spreadsheetId = snapshotSpreadsheetId();
  const hasWriter = Boolean(serviceAccountFromEnv());

  if (!spreadsheetId && !outputFile) {
    console.log('Seller OS snapshot skipped: SELLER_OS_SNAPSHOT_SPREADSHEET_ID is not configured.');
    console.log('Set that secret plus GOOGLE_SERVICE_ACCOUNT_JSON to publish the free Sheets snapshot.');
    return;
  }
  if (spreadsheetId && !hasWriter && !outputFile) {
    console.log('Seller OS snapshot skipped: Google service account credentials are not configured.');
    console.log('Add GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.');
    return;
  }

  console.log('Building Seller OS snapshot from Google Sheets...');
  const snapshot = await buildSnapshot();
  const summary = {
    generatedAt: snapshot.generatedAt,
    rowCount: snapshot.rowCount,
    sourceCount: snapshot.sourceCount,
    errorCount: snapshot.errorCount,
    tabErrors: snapshot.tabErrors.length,
  };

  if (outputFile) {
    const filePath = path.resolve(outputFile);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    console.log(`Wrote local snapshot: ${filePath}`);
  }

  if (spreadsheetId && hasWriter) {
    const written = await writeSnapshotToSheet(snapshot);
    console.log(`Published snapshot to ${written.spreadsheetId} / ${written.tab}`);
    console.log(`Chunks: ${written.chunks}; bytes: ${written.bytes}`);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (snapshot.errorCount > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
