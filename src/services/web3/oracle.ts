import type { Network, AuthProof } from "@/types";
import { useWalletStore } from "@/stores/wallet";
import ACCOUNT_ABI from "@/configs/abi/AccountSimple.json";
import HEXLINK_ABI from "@/configs/abi/AccountSimple.json";
import { hexlinkContract } from "@/services/web3/hexlink";
import { ethers } from "ethers";
import { getFunctions, httpsCallable } from 'firebase/functions'

const functions = getFunctions()

const genRequestId = async function(
    network: Network,
    func: string,
    data: string | [],
) {
    const hexlink = hexlinkContract(network);
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes4", "bytes", "address", "uint256", "uint256"],
        [
            func,
            data,
            hexlink.address,
            network.chainId,
            await hexlink.nonce()
        ]
      )
    );
};

export async function genDeployAuthProof(
    network: Network,
    data: string
) : Promise<{ initData: string, proof: AuthProof }> {
    const wallet = useWalletStore();
    if (!wallet.connected) {
        throw new Error("Not connected");
    }

    const accountIface = new ethers.utils.Interface(ACCOUNT_ABI);
    const initData = accountIface.encodeFunctionData(
        "init", [wallet.wallet!.account.address, data]
    );
    const hexlinkIface = new ethers.utils.Interface(HEXLINK_ABI);
    const requestId = await genRequestId(
        network,
        hexlinkIface.getSighash("deploy"),
        initData
    );
    const genAuthProof = httpsCallable(functions, 'genTwitterOAuthProof');
    const result = await genAuthProof({requestId});
    return {
        initData,
        proof: result.data as AuthProof
    };
}