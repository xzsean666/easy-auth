/**
 * Core domain types and models for Easy Auth SDK
 */
interface User {
    id: string;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
interface Identity {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    profile?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
interface AuthResult {
    user: User;
    identity: Identity;
    token: string;
    isNewUser: boolean;
    loginType: string;
}
interface EasyAuthJwtPayload {
    sub: string;
    iss: string;
    aud?: string;
    iat: number;
    exp: number;
    metadata?: Record<string, any>;
    identities?: string[];
    [key: string]: any;
}
interface VerifyOptions {
    /**
     * If true (default), loads the latest User record from the storage adapter.
     * If false, extracts user info directly from the JWT payload for stateless zero-IO verification.
     */
    fetchUser?: boolean;
}
interface VerifyResult {
    userId: string;
    metadata: Record<string, any>;
    user: User;
    payload: EasyAuthJwtPayload;
}
interface CreateUserData {
    id?: string;
    metadata?: Record<string, any>;
    createdAt?: Date;
    updatedAt?: Date;
}
interface CreateIdentityData {
    id?: string;
    userId: string;
    provider: string;
    providerUserId: string;
    profile?: Record<string, any>;
    createdAt?: Date;
    updatedAt?: Date;
}

export type { AuthResult as A, CreateUserData as C, EasyAuthJwtPayload as E, Identity as I, User as U, VerifyOptions as V, CreateIdentityData as a, VerifyResult as b };
