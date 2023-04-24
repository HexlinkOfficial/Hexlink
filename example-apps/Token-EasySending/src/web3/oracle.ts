import { getFunctions, httpsCallable, type HttpsCallable } from '@firebase/functions'
import { useWalletStore } from "@/stores/wallet";
import { useAuthStore } from "@/stores/auth";
import { useChainStore } from "@/stores/chain";
import { Hexlink } from "@hexlink/contracts"

const functions = getFunctions();

export const buildAccountInitData = async (owner: string) => {
    return accountInterface.encodeFunctionData("init", [owner]);
}

export const genRequestId = async function(
    provider: Provider,
    owner: string,
    func: string
) {
    const hexlink = await hexlContract(provider);
    const data = buildAccountInitData(owner);
    const requestId = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
        ["bytes4", "address", "uint256", "bytes"],
        [
            func,
            hexlink.address,
            (await provider.getNetwork()).chainId,
            data
        ]
        )
    );
    return requestId;
};

export async function genDeployAuthProof() : Promise<{ proof: string }> {
        const wallet = useWalletStore();
    if (!wallet.connected) {
        throw new Error("Not connected");
    }

    const identityType = useAuthStore().user!.schema;
    let genAuthProof: HttpsCallable;
    if (schema === "mailto") {
        genAuthProof = httpsCallable(functions, 'genEmailAuthProof');
    } else {
        throw new Error(`identity schema ${schema} is not supported.`)
    }

    const requestId = await genRequestId(
        useChainStore().provider,
        wallet.account!.address,
        hexlInterface.getSighash("deploy")
    );
    const result = await genAuthProof({requestId});
    return (result.data as any).proof as string;
}