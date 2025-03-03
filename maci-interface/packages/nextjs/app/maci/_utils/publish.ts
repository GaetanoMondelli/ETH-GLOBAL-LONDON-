import { MACI__factory as MACIFactory, Poll__factory as PollFactory } from "../../../../hardhat/typechain-types";
import { genRandomSalt } from "maci-crypto";
import { Keypair, PCommand, PrivKey, PubKey } from "maci-domainobjs";


/**
 * Publish a new message to a MACI Poll contract
 * @param PublishArgs - The arguments for the publish command
 * @returns The ephemeral private key used to encrypt the message
 */
export const publish = async ({
  pubkey,
  stateIndex,
  voteOptionIndex,
  nonce,
  pollId,
  newVoteWeight,
  maciContractAddress,
  salt,
  privateKey,
  signer,
  quiet = true,
}: any): Promise<any> => {

  // validate that the pub key of the user is valid
  if (!PubKey.isValidSerializedPubKey(pubkey)) {
    console.log("invalid MACI public key");
  }
  // deserialize
  const userMaciPubKey = PubKey.deserialize(pubkey);

  if (!PrivKey.isValidSerializedPrivKey(privateKey)) {
    console.log("Invalid MACI private key");
  }

  const userMaciPrivKey = PrivKey.deserialize(privateKey);

  // validate args
  if (voteOptionIndex < 0) {
    console.log("invalid vote option index");
  }

  // check < 1 cause index zero is a blank state leaf
  if (stateIndex < 1) {
    console.log("invalid state index");
  }

  if (nonce < 0) {
    console.log("invalid nonce");
  }

  const userSalt = salt ? BigInt(salt) : genRandomSalt();

  if (pollId < 0) {
    console.log("Invalid poll id");
  }

  const maciContract = MACIFactory.connect(maciContractAddress, signer);
  const pollAddress = await maciContract.getPoll(pollId);

  const pollContract = PollFactory.connect(pollAddress, signer);

  const maxValues = await pollContract.maxValues();
  const coordinatorPubKeyResult = await pollContract.coordinatorPubKey();
  const maxVoteOptions = Number(maxValues.maxVoteOptions);

  // validate the vote options index against the max leaf index on-chain
  if (maxVoteOptions < voteOptionIndex) {
    console.log("Invalid vote option index");
  }

  const coordinatorPubKey = new PubKey([
    BigInt(coordinatorPubKeyResult.x.toString()),
    BigInt(coordinatorPubKeyResult.y.toString()),
  ]);

  const encKeypair = new Keypair();

  // create the command object
  const command: PCommand = new PCommand(
    stateIndex,
    userMaciPubKey,
    voteOptionIndex,
    newVoteWeight,
    nonce,
    BigInt(pollId),
    userSalt,
  );

  // sign the command with the user private key
  const signature = command.sign(userMaciPrivKey);
  // encrypt the command using a shared key between the user and the coordinator
  const message = command.encrypt(signature, Keypair.genEcdhSharedKey(encKeypair.privKey, coordinatorPubKey));

  try {
    // submit the message onchain as well as the encryption public key
    const tx = await pollContract.publishMessage(message.asContractParam(), encKeypair.pubKey.asContractParam());
    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      console.log("Transaction failed");
    }

    console.log(quiet, `Transaction hash: ${receipt!.hash}`);
    console.log(quiet, `Ephemeral private key: ${encKeypair.privKey.serialize()}`);
    return {
      tx,
      receipt,
      encKeypair,
    };
  } catch (error) {
    console.log((error as Error).message);
  }

  // we want the user to have the ephemeral private key
  return encKeypair.privKey.serialize();
};
