import type { AuthProvider, FunctionalAuthProvider } from "./base.js";
import { EasyAuthError } from "../core/errors.js";

/**
 * Registry for managing and dispatching authentication providers.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, AuthProvider>();

  /**
   * Registers a provider instance
   */
  register(provider: AuthProvider): void {
    if (!provider || !provider.name || typeof provider.name !== "string" || provider.name.trim().length === 0) {
      throw new EasyAuthError("CONFIG_ERROR", "Provider must have a valid non-empty 'name' property.");
    }
    if (typeof provider.verifyAndExtract !== "function") {
      throw new EasyAuthError("CONFIG_ERROR", `Provider "${provider.name}" must implement "verifyAndExtract" method.`);
    }

    this.providers.set(provider.name.toLowerCase(), provider);
  }

  /**
   * Registers a functional provider with a single verification function
   */
  registerFunction<TCredentials = any, TProfile = any>(
    name: string,
    verifyFn: FunctionalAuthProvider<TCredentials, TProfile>
  ): void {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new EasyAuthError("CONFIG_ERROR", "Provider name must be a non-empty string.");
    }
    if (typeof verifyFn !== "function") {
      throw new EasyAuthError("CONFIG_ERROR", `Verification function for provider "${name}" must be a function.`);
    }

    this.register({
      name: name.toLowerCase(),
      verifyAndExtract: verifyFn,
    });
  }

  /**
   * Retrieves a registered provider by name. Throws PROVIDER_NOT_FOUND if not found.
   */
  get(name: string): AuthProvider {
    if (!name || typeof name !== "string") {
      throw new EasyAuthError("PROVIDER_NOT_FOUND", "Provider name must be specified.");
    }

    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new EasyAuthError(
        "PROVIDER_NOT_FOUND",
        `Authentication provider "${name}" is not registered. Registered providers: [${this.list().join(", ")}]`
      );
    }

    return provider;
  }

  /**
   * Checks if a provider is registered
   */
  has(name: string): boolean {
    if (!name || typeof name !== "string") return false;
    return this.providers.has(name.toLowerCase());
  }

  /**
   * Returns a list of all registered provider names
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
