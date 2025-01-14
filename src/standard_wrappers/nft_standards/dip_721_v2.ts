import { Actor, ActorSubclass, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';

import { NFTCollection, NFTDetails } from '../../interfaces/nft';
import Interface, {
  TokenMetadata,
  GenericValue,
} from '../../interfaces/dip_721_v2';
import IDL from '../../idls/dip_721_v2.did';
import NFT from './default';
import { NFT as NFTStandard } from '../../constants/standards';
import { ok } from 'assert';
import { MetadataReturn } from '../../interfaces/dip_721';

interface Property {
  name: string;
  value: string;
}

interface MetadataKeyVal {
  key: string;
  val: GenericValue;
}

interface Metadata {
  [key: string]:
    | { value: MetadataKeyVal; purpose: string }
    | Array<Property>
    | string;
  properties: Array<Property>;
}

const extractMetadataValue = (metadata: any) => {
  const metadataKey = Object.keys(metadata)[0];
  const value = metadata[metadataKey];
  return typeof value === 'object' ? JSON.stringify(value) : value;
};

export default class DIP721v2 extends NFT {
  standard = NFTStandard.dip721v2;

  actor: ActorSubclass<Interface>;

  constructor(canisterId: string, agent: HttpAgent) {
    super(canisterId, agent);

    this.actor = Actor.createActor(IDL, {
      agent,
      canisterId,
    });
  }

  async getMetadata(): Promise<NFTCollection> {
    const metadata = await this.actor.metadata();
    return {
      icon: metadata?.logo[0],
      name: metadata?.name?.[0] || '',
      standard: this.standard,
      canisterId: this.canisterId,
      tokens: [],
      description: '',
    }
  }

  async getUserTokens(principal: Principal): Promise<NFTDetails[]> {
    const userTokensResult = await this.actor.ownerTokenMetadata(principal);
    const tokens: Array<TokenMetadata> = userTokensResult['Ok'] || [];
    return tokens.map((token) => {
      const tokenIndex = token.token_identifier;
      const formatedMetadata = this.formatMetadata(token);
      const operator = token.operator?.[0]?.toText();

      return this.serializeTokenData(
        formatedMetadata,
        tokenIndex,
        principal.toText(),
        operator,
      );
    });
  }

  async transfer(to: Principal, tokenIndex: number): Promise<void> {
    const transferResult = await this.actor.transfer(
      to,
      BigInt(tokenIndex)
    );
    if ('Err' in transferResult)
      throw new Error(
        `${Object.keys(transferResult.Err)[0]}: ${
          Object.values(transferResult.Err)[0]
        }`
      );
  }

  async details(tokenIndex: number): Promise<NFTDetails> {
    const metadataResult = await this.actor.tokenMetadata(BigInt(tokenIndex));

    if ('Err' in metadataResult)
      throw new Error(
        `${Object.keys(metadataResult.Err)[0]}: ${
          Object.values(metadataResult.Err)[0]
        }`
      );
    const metadata = metadataResult?.Ok;
    const formatedMetadata = this.formatMetadata(metadata);
    const owner = metadata?.owner?.[0]?.toText?.();
    const operator = metadata?.operator?.[0]?.toText?.();

    return this.serializeTokenData(formatedMetadata, tokenIndex, owner, operator);
  }

  private serializeTokenData(
    metadata: any,
    tokenIndex: number | bigint,
    owner: string | undefined,
    operator: string | undefined
  ): NFTDetails {
    return {
      index: BigInt(tokenIndex),
      canister: this.canisterId,
      metadata,
      owner,
      url: metadata?.location?.value?.TextContent || '',
      standard: this.standard,
      operator,
    };
  }

  private formatMetadata(metadata: TokenMetadata): Metadata {
    const metadataResult = { properties: new Array<Property>() };

    metadata.properties.map((prop) => {
      metadataResult[prop[0]] = { value: prop[1] };
      metadataResult.properties = [
        ...metadataResult.properties,
        { name: prop[0], value: extractMetadataValue(prop[1]) },
      ];
    });

    // Filter out reserved props from the unique traits
    metadataResult.properties = metadataResult.properties.filter(
      ({ name }) =>
        !['location', 'thumbnail', 'contentHash', 'contentType'].includes(name)
    );
    return metadataResult;
  }
}
