const { acquireTransactionLock, releaseTransactionLock } = require('./transactionLock');

/**
 * Shared Gkash success-path: lock → runProcess() → branch on result.
 *
 * After `runProcess()` returns (same object as `processOrderTransaction`):
 * - `result.status === 'success'` → `res.redirect(urlSuccessHeader)` (lock kept)
 * - any other status → release lock → `res.redirect(urlFailHeader)`
 * - thrown error → release lock → `res.redirect(urlFailHeader)`
 *
 * Duplicate concurrent callbacks: lock not acquired → success redirect without processing.
 * Lock is not released on success (TTL overwrite; see transactionLock).
 */
async function handleGkashReturnSettlement({
  vCartID,
  urlSuccessHeader,
  urlFailHeader,
  lockSource,
  res,
  runProcess,
  onProcessFailure,
  onFlowError,
}) {
  if (!vCartID || String(vCartID).trim() === '') {
    res.redirect(urlFailHeader);
    return;
  }

  let gotLock = false;
  try {
    gotLock = await acquireTransactionLock(vCartID, lockSource, 5);
  } catch (e) {
    console.error('[GkashReturn] lock_acquire_error', lockSource, e);
    res.redirect(urlFailHeader);
    return;
  }

  if (!gotLock) {
    console.log(
      `[GkashReturn] duplicate_callback cartId=${vCartID} lockSource=${lockSource}`
    );
    res.redirect(urlSuccessHeader);
    return;
  }

  try {
    const result = await runProcess();
    if (result && result.status === 'success') {
      if (typeof onFlowError !== 'function') {
        console.log('Order transaction processed successfully:', result.message);
        console.log(
          'payment and order processing successful, redirected to ' + urlSuccessHeader
        );
      }
      res.redirect(urlSuccessHeader);
    } else {
      if (typeof onProcessFailure === 'function') {
        try {
          await onProcessFailure(result);
        } catch (cbErr) {
          console.error('[GkashReturn] onProcessFailure_error', cbErr);
        }
      } else {
        console.error('Order transaction failed:', result && result.error);
        console.log(
          'payment successful but order processing failed, redirected to ' + urlFailHeader
        );
      }
      await releaseTransactionLock(vCartID);
      res.redirect(urlFailHeader);
    }
  } catch (error) {
    if (typeof onFlowError !== 'function') {
      console.error('Error processing order transaction:', error);
    }
    console.error('[GkashReturn] process_error', lockSource, error);
    if (typeof onFlowError === 'function') {
      try {
        await onFlowError(error);
      } catch (cbErr) {
        console.error('[GkashReturn] onFlowError_error', cbErr);
      }
    }
    await releaseTransactionLock(vCartID);
    res.redirect(urlFailHeader);
  }
}

module.exports = {
  handleGkashReturnSettlement,
  acquireTransactionLock,
  releaseTransactionLock,
};
