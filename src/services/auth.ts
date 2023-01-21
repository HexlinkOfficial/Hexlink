import {
    getAuth,
    GoogleAuthProvider,
    TwitterAuthProvider,
    signInWithPopup,
    signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import type { IUser } from "@/types";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/services/firebase';
import { useAuthStore } from "@/stores/auth";
import { useWalletStore } from "@/stores/wallet";
import { switchNetwork } from "@/web3/network";
import { genNameHash, initHexlAccount } from '@/web3/account';
import { GOERLI } from "@/configs/network";
import { useNetworkStore } from '@/stores/network';
import { SUPPORTED_NETWORKS } from "@/configs/network";
import { initTokenList } from "@/web3/tokens";

const auth = getAuth(app)
const functions = getFunctions()

export async function getIdTokenAndSetClaimsIfNecessary(user: User, refresh: boolean = false) {
    let idToken = await user.getIdToken(refresh)
    const idTokenResult = await user.getIdTokenResult()
    if (!idTokenResult.claims['https://hasura.io/jwt/claims']) {
        const refreshToken = httpsCallable(functions, 'refreshToken')
        try {
            await refreshToken()
            idToken = await user.getIdToken(true)
        } catch (error: any) {
            console.error(
                "Unable to refresh token, which doesn't have Hasura claim.",
            )
            signOutFirebase()
            throw(error)
        }
    }
    return idToken
}

export async function refreshToken() {
    const idToken = await getIdTokenAndSetClaimsIfNecessary(auth.currentUser!, true);
    const store = useAuthStore();
    store.refreshIdToken(idToken);
}

export async function googleSocialLogin() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider)
        const idToken = await getIdTokenAndSetClaimsIfNecessary(result.user)
        const nameHash = genNameHash("mailto", result.user.email!);
        const user : IUser = {
            provider: "google.com",
            identityType: "email",
            authType: "oauth",
            uid: result.user.uid,
            providerUid: result.user.uid, // TODO: ensure this is google uid
            handle: result.user.email!,
            displayName: result.user.displayName || undefined,
            photoURL: result.user.photoURL || undefined,
            nameHash,
            idToken
        };
        useAuthStore().signIn(user);
        await init();
        await switchNetwork(GOERLI);
    } catch (error: any) {
        if (error.code == 'auth/popup-closed-by-user') {
            return
        }
    }
}

export async function twitterSocialLogin() {
    const provider = new TwitterAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const idToken = await getIdTokenAndSetClaimsIfNecessary(result.user);
        const providerUid = result.user.providerData[0].uid;
        const nameHash = genNameHash("twitter.com", providerUid);
        const user : IUser = {
            provider: "twitter.com",
            identityType: "twitter.com",
            authType: "oauth",
            uid: result.user.uid,
            providerUid,
            handle: result.user.reloadUserInfo.screenName,
            displayName: result.user.displayName || undefined,
            photoURL: result.user.photoURL || undefined,
            nameHash,
            idToken,
        };
        useAuthStore().signIn(user);
        await init();
        await switchNetwork(GOERLI);
    } catch (error) {
        console.log(error);
    }
}

export function signOutFirebase() {
    useWalletStore().disconnectWallet();
    useAuthStore().signOut();
    useNetworkStore().reset();
    return signOut(auth);
}

export async function init() {
    const user = useAuthStore().user!;
    await Promise.all(
        SUPPORTED_NETWORKS.map(network => initHexlAccount(network, user.nameHash))
    );
    await Promise.all(
        SUPPORTED_NETWORKS.map(network => initTokenList(network))
    );
}