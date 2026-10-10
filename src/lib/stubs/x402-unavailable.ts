/**
 * Stand-in for the optional `@x402/*` packages. They are optional peer
 * dependencies of `@coinbase/cdp-sdk` (pulled in by RainbowKit's Base Account
 * connector) and are only used for x402 payments, which Contribo never uses.
 * Aliased in next.config.ts so the bundler does not fail on the unresolved imports;
 * anything that actually calls them gets a clear error.
 */
const unavailable = (): never => {
  throw new Error("x402 payments are not available in Contribo.");
};

export default unavailable;
export const AuthCaptureEvmScheme = unavailable;
export const BUILDER_CODE = unavailable;
export const BUILDER_CODE_PATTERN = unavailable;
export const BUILDER_CODE_SCHEMA = unavailable;
export const BatchSettlementEvmScheme = unavailable;
export const BuilderCodeClientExtension = unavailable;
export const ExactEvmScheme = unavailable;
export const ExactEvmSchemeV1 = unavailable;
export const ExactSvmScheme = unavailable;
export const ExactSvmSchemeV1 = unavailable;
export const HTTPFacilitatorClient = unavailable;
export const PaymentRequirementsV1Schema = unavailable;
export const PaymentRequirementsV2Schema = unavailable;
export const UptoEvmScheme = unavailable;
export const UptoSvmScheme = unavailable;
export const bazaarResourceServerExtension = unavailable;
export const builderCodeResourceServerExtension = unavailable;
export const paymentMiddlewareFromConfig = unavailable;
export const paymentMiddlewareFromHTTPServer = unavailable;
export const registerExactEvmScheme = unavailable;
export const registerExactSvmScheme = unavailable;
export const toClientEvmSigner = unavailable;
export const wrapFetchWithPayment = unavailable;
export const x402Client = unavailable;
export const x402HTTPResourceServer = unavailable;
export const x402ResourceServer = unavailable;
