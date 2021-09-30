import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as cronParser from "cron-parser";
import { createCertValidation } from "./route53";
import { publicReadPolicyForBucket } from "./s3";
import { TezosImageResolver } from "./TezosImageResolver";
import * as docker from "@pulumi/docker";

import * as fs from 'fs';
import * as YAML from 'yaml';
const mime = require("mime");

export interface TezosHelmParameters {
  readonly helmValues: any;
}

export interface TezosInitParameters {
  getName(): string;
  getChainName(): string;
  getDescription(): string;
  getHumanName(): string;
  isPeriodic(): boolean;
  getContainerImage(): string | pulumi.Output<string>;
  getDnsName(): string;
  getCategory(): string;
  getPeers(): string[];
  getContracts(): string[];
  getCommitments(): string;
  getChartRepo(): string;
  getChartRepoVersion(): string;
  getChartPath(): string;
  getPrivateBakingKey(): string;
  getPrivateNonbakingKey(): string;
  getNumberOfFaucetAccounts(): number;
  getFaucetSeed(): string;
  getFaucetRecaptchaSiteKey(): string;
  getFaucetRecaptchaSecretKey(): string;
}

export interface TezosParamsInitializer {
  readonly name?: string;
  readonly chainName?: string;
  readonly description?: string;
  readonly humanName?: string;
  readonly schedule?: string;
  readonly category?: string;
  readonly containerImage?: string | pulumi.Output<string>;
  readonly dnsName?: string;
  readonly bootstrapPeers?: string[];
  readonly bootstrapContracts?: string[];
  readonly bootstrapCommitments?: string;
  readonly chartRepo?: string;
  readonly chartRepoVersion?: string;
  readonly chartPath?: string;
  readonly privateBakingKey?: string;
  readonly privateNonbakingKey?: string;
  readonly yamlFile?: string;
  readonly numberOfFaucetAccounts?: number; 
  readonly faucetSeed?: string;
  readonly faucetRecaptchaSiteKey?: string;
  readonly faucetRecaptchaSecretKey?: string;
}


export class TezosChainParametersBuilder implements TezosHelmParameters, TezosInitParameters {
  private _helmValues: any;
  private _name: string;
  private _description: string;
  private _humanName: string;
  private _periodic: boolean;
  private _dnsName: string;
  private _category: string;
  private _publicBootstrapPeers: string[];
  private _bootstrapContracts: string[];
  private _bootstrapCommitments: string;
  private _chartRepo: string;
  private _chartRepoVersion: string;
  private _chartPath: string;
  private _numberOfFaucetAccounts: number;
  private _faucetSeed: string;
  private _faucetRecaptchaSiteKey: string;
  private _faucetRecaptchaSecretKey: string;
    

  constructor(params: TezosParamsInitializer = {}) {
    this._name = params.name || params.dnsName || '';
    this._description = params.description || '';
    this._humanName = params.humanName || '';
    this._dnsName = params.dnsName || params.name || '';
    this._category = params.category || '';
    this._publicBootstrapPeers = params.bootstrapPeers || [];
    this._bootstrapContracts = params.bootstrapContracts || [];
    this._bootstrapCommitments = params.bootstrapCommitments || '';
    this._chartRepo = params.chartRepo || '';
    this._chartRepoVersion = params.chartRepoVersion || '';
    this._chartPath = params.chartPath || '';
    this._periodic = false;
    this._numberOfFaucetAccounts = params.numberOfFaucetAccounts || 0;
    this._faucetSeed = params.faucetSeed || '';
    this._faucetRecaptchaSiteKey = params.faucetRecaptchaSiteKey || '';
    this._faucetRecaptchaSecretKey = params.faucetRecaptchaSecretKey || '';
    
    this._helmValues = {};
    if (params.yamlFile) {
      this.fromFile(params.yamlFile);
    }
    if (params.schedule) {
      this.schedule(params.schedule);
    }
    if (params.chainName) {
      this.chainName(params.chainName);
    }
    if (params.containerImage) {
      this.containerImage(params.containerImage);
    }
    if (params.privateBakingKey) {
      this.privateBakingKey(params.privateBakingKey);
    }
    if (params.privateNonbakingKey) {
      this.privateNonbakingKey(params.privateNonbakingKey);
    }
  }

  public fromYaml(yaml: string): TezosChainParametersBuilder {
    this._helmValues = YAML.parse(yaml);
    return this;
  }

  public fromFile(yamlPath: string): TezosChainParametersBuilder {
    this.fromYaml(fs.readFileSync(yamlPath, 'utf8'));
    return this;
  }

  public name(name: string): TezosChainParametersBuilder {
    this._name = name;
    this._dnsName = this._dnsName || name;
    return this;
  }
  public getName(): string {
    return this._name;
  }

  public chainName(chainName: string): TezosChainParametersBuilder {
    this._helmValues["node_config_network"]["chain_name"] = chainName;
    return this;
  }
  public timestamp(timestamp: string): TezosChainParametersBuilder {
    this._helmValues["node_config_network"]["genesis"]["timestamp"] = timestamp;
    return this;
  }
  public getChainName(): string {
    return this._helmValues["node_config_network"]["chain_name"];
  }
  
  public containerImage(containerImage: string | pulumi.Output<String>): TezosChainParametersBuilder {
    this._helmValues["images"]["octez"] = containerImage
    return this;
  }
  public getContainerImage(): string {
    return this._helmValues["images"]["octez"];
  }

  public dnsName(dnsName: string): TezosChainParametersBuilder {
    this._dnsName = dnsName;
    this._name = this._name || dnsName;
    return this;
  }
  public getDnsName(): string | any {
    return this._dnsName;
  }
  public getCategory(): string | any {
    return this._category;
  }

  public description(description: string): TezosChainParametersBuilder {
    this._description = description;
    return this;
  }
  public getDescription(): string | any {
    return this._description;
  }

  public getHumanName(): string | any {
    return this._humanName;
  }

  public isPeriodic(): boolean {
    return this._periodic;
  }

  public schedule(cronExpr: string): TezosChainParametersBuilder {
    const deployDate = new Date(cronParser.parseExpression(cronExpr, {utc: true}).prev().toLocaleString());
    const imageResolver = new TezosImageResolver();
    this.containerImage(pulumi.output(imageResolver.getLatestTagAsync(deployDate))
                          .apply(tag => `${imageResolver.image}:${tag}`));

    this.name(`${this.getDnsName().toLowerCase()}-${deployDate.toISOString().split('T')[0]}`);
    this.chainName(`TEZOS-${this.getDnsName().toUpperCase()}-${deployDate.toISOString()}`);
    this.timestamp(deployDate.toISOString());
    this._periodic = true;

    return this;
  }

  public peers(peers: string[]): TezosChainParametersBuilder {
    this._publicBootstrapPeers = peers;
    return this;
  }
  public peer(peer: string): TezosChainParametersBuilder {
    this._publicBootstrapPeers.push(peer);
    return this;
  }
  public getPeers(): string[] {
    return this._publicBootstrapPeers;
  }

  public contracts(contracts: string[]): TezosChainParametersBuilder {
    this._bootstrapContracts = contracts;
    return this;
  }
  public contract(contract: string): TezosChainParametersBuilder {
    this._bootstrapContracts.push(contract);
    return this;
  }
  public getContracts(): string[] {
    return this._bootstrapContracts;
  }

  public commitments(commitments: string): TezosChainParametersBuilder {
    this._bootstrapCommitments = commitments;
    return this;
  }
  public getCommitments(): string {
    return this._bootstrapCommitments;
  }

  public getNumberOfFaucetAccounts(): number {
    return this._numberOfFaucetAccounts;
  }

  public getFaucetSeed(): string {
    return this._faucetSeed;
  }

  public getFaucetRecaptchaSiteKey(): string {
    return this._faucetRecaptchaSiteKey;
  }

  public getFaucetRecaptchaSecretKey(): string {
    return this._faucetRecaptchaSecretKey;
  }

  public chartRepo(chartRepo: string): TezosChainParametersBuilder {
    this._chartRepo = chartRepo;
    return this;
  }
  public chartRepoVersion(chartRepoVersion: string): TezosChainParametersBuilder {
    this._chartRepoVersion = chartRepoVersion;
    return this;
  }
  public chartPath(chartPath: string): TezosChainParametersBuilder {
    this._chartPath = chartPath;
    return this;
  }
  public getChartRepo(): string {
    return this._chartRepo;
  }
  public getChartRepoVersion(): string {
    return this._chartRepoVersion;
  }
  public getChartPath(): string {
    return this._chartPath;
  }

  public privateBakingKey(privateBakingKey: string): TezosChainParametersBuilder {
    this._helmValues["accounts"]["oxheadbaker"]["key"] = privateBakingKey;
    return this;
  }
  public getPrivateBakingKey(): string {
    return this._helmValues["accounts"]["oxheadbaker"]["key"];
  }

  public privateNonbakingKey(privateNonbakingKey: string): TezosChainParametersBuilder {
    this._helmValues["accounts"]["tqfree"]["key"] = privateNonbakingKey;
    return this;
  }
  public getPrivateNonbakingKey(): string {
    return this._helmValues["accounts"]["tqfree"]["key"];
  }

  public get helmValues(): string {
    return this._helmValues;
  }

}

/**
 * Deploy a tezos-k8s topology in a k8s cluster.
 * Supports either local charts or charts from a repo
 */

export class TezosChain extends pulumi.ComponentResource {
  readonly params: TezosHelmParameters & TezosInitParameters;
  readonly provider: k8s.Provider;
  readonly repo: awsx.ecr.Repository;

  // readonly ns: k8s.core.v1.Namespace;
  // readonly chain: k8s.helm.v2.Chart;

  /**
  * Deploys a private chain on a Kubernetes cluster.
  * @param name The name of the Pulumi resource.
  * @param params Helm chart values and chain bootstrap parameters
  * @param provider The Kubernetes cluster to deploy it into.
  * @param repo The container repository where to push the custom images for this chain.
  */
  constructor(params: TezosHelmParameters & TezosInitParameters,
              provider: k8s.Provider,
              repo: awsx.ecr.Repository,
              opts?: pulumi.ResourceOptions) {

    const inputs: pulumi.Inputs = {
      options: opts,
    };

    const name = params.getName();
    super("pulumi-contrib:components:TezosChain", name, inputs, opts);

    this.params = params;
    this.provider = provider;
    this.repo = repo;
  
    var ns = new k8s.core.v1.Namespace(name,
      { metadata: { name: name, } },
      { provider: this.provider }
    );

    if (("activation" in params.helmValues) && (params.getContracts() || params.getCommitments())) {
      const activationBucket = new aws.s3.Bucket(`${name}-activation-bucket`);
      const bucketPolicy = new aws.s3.BucketPolicy(`${name}-activation-bucket-policy`, {
        bucket: activationBucket.bucket,
        policy: activationBucket.bucket.apply(publicReadPolicyForBucket)
      });
      params.helmValues["activation"]["bootstrap_contract_urls"] = [];

      if (params.getContracts()) {
        params.getContracts().forEach(function (contractFile: any) {
            const bucketObject = new aws.s3.BucketObject(`${name}-${contractFile}`, {
                bucket: activationBucket.bucket,
                key: contractFile,
                source: new pulumi.asset.FileAsset(`bootstrap_contracts/${contractFile}`),
                contentType: mime.getType(contractFile),
                acl: 'public-read'
            });
            params.helmValues["activation"]["bootstrap_contract_urls"].push(pulumi.interpolate `https://${activationBucket.bucketRegionalDomainName}/${contractFile}`);
        })
      }

      if (params.getCommitments()) {
        const commitmentFile = params.getCommitments();
        const bucketObject = new aws.s3.BucketObject(`${name}-${commitmentFile}`, {
          bucket: activationBucket.bucket,
          key: commitmentFile,
          source: new pulumi.asset.FileAsset(`bootstrap_commitments/${commitmentFile}`),
          contentType: mime.getType(commitmentFile),
          acl: 'public-read'
        });
        params.helmValues["activation"]["commitments_url"] = pulumi.interpolate`https://${activationBucket.bucketRegionalDomainName}/${commitmentFile}`;
      }
    }

    // Hosted zones should really be owned by pulumi. Then we could
    // reference them instead of hardcoding strings.
    const teztnetsHostedZone = "teztnets.xyz"
    const teztnetsDomain = `${name}.${teztnetsHostedZone}`

    if (params.getNumberOfFaucetAccounts() > 0 && "activation" in params.helmValues) {
      // deploy a faucet website
      const chainSpecificSeed = `${params.getFaucetSeed()}-${params.getChainName()}`
      const faucetAccountGenImg = this.repo.buildAndPushImage(
        "tezos-faucet/account-gen"
      )
      const faucetAppImg = this.repo.buildAndPushImage("tezos-faucet/app")

      new k8s.helm.v2.Chart(
        `${name}-faucet`,
        {
          namespace: ns.metadata.name,
          path: `tezos-faucet/charts/faucet`,
          values: {
            recaptcha_keys: {
              siteKey: params.getFaucetRecaptchaSiteKey(),
              secretKey: params.getFaucetRecaptchaSecretKey(),
            },
            number_of_accounts: params.getNumberOfFaucetAccounts(),
            seed: chainSpecificSeed,
            images: {
              account_gen: faucetAccountGenImg,
              faucet: faucetAppImg,
            },
          },
        },
        { providers: { kubernetes: this.provider } }
      )

      // add the faucet seed to the activation parameters so the accounts given
      // by the faucet website work on chain
      params.helmValues["activation"]["deterministic_faucet"] = {
        seed: chainSpecificSeed,
        number_of_accounts: params.getNumberOfFaucetAccounts(),
      }

      const faucetDomain = `faucet.${teztnetsDomain}`
      const faucetCert = new aws.acm.Certificate(
        `${faucetDomain}-cert`,
        {
          validationMethod: "DNS",
          domainName: faucetDomain,
        },
        { parent: this }
      )
      const { certValidation } = createCertValidation(
        {
          cert: faucetCert,
          targetDomain: faucetDomain,
          hostedZone: teztnetsHostedZone,
        },
        { parent: this }
      )

      const ingressName = `${faucetDomain}-ingress`
      new k8s.networking.v1beta1.Ingress(
        ingressName,
        {
          metadata: {
            namespace: ns.metadata.name,
            name: ingressName,
            annotations: {
              "kubernetes.io/ingress.class": "alb",
              "alb.ingress.kubernetes.io/scheme": "internet-facing",
              "alb.ingress.kubernetes.io/healthcheck-path": "/",
              "alb.ingress.kubernetes.io/healthcheck-port": "8081",
              "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}, {"HTTPS":443}]',
              "ingress.kubernetes.io/force-ssl-redirect": "true",
              "alb.ingress.kubernetes.io/actions.ssl-redirect":
                '{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS", "Port": "443", "StatusCode": "HTTP_301"}}',
            },
            labels: { app: "faucet" },
          },
          spec: {
            rules: [
              {
                host: faucetDomain,
                http: {
                  paths: [
                    {
                      path: "/*",
                      backend: {
                        serviceName: "ssl-redirect",
                        servicePort: "use-annotation",
                      },
                    },
                    {
                      path: "/*",
                      backend: {
                        serviceName: "faucet",
                        servicePort: "http",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        { provider, parent: this, dependsOn: certValidation }
      )
    }
    // RPC Ingress
    const rpcDomain = `rpc.${teztnetsDomain}`
    const rpcCert = new aws.acm.Certificate(
      `${rpcDomain}-cert`,
      {
        validationMethod: "DNS",
        domainName: rpcDomain,
      },
      { parent: this }
    )
    const { certValidation } = createCertValidation(
      {
        cert: rpcCert,
        targetDomain: rpcDomain,
        hostedZone: teztnetsHostedZone,
      },
      { parent: this }
    )

    const rpcIngName = `${rpcDomain}-ingress`
    const rpc_ingress = new k8s.networking.v1beta1.Ingress(
      rpcIngName,
      {
        metadata: {
          namespace: ns.metadata.name,
          name: rpcIngName,
          annotations: {
            "kubernetes.io/ingress.class": "alb",
            "alb.ingress.kubernetes.io/scheme": "internet-facing",
            "alb.ingress.kubernetes.io/healthcheck-path":
              "/chains/main/chain_id",
            "alb.ingress.kubernetes.io/healthcheck-port": "8732",
            "alb.ingress.kubernetes.io/listen-ports":
            '[{"HTTP": 80}, {"HTTPS":443}]',
            "ingress.kubernetes.io/force-ssl-redirect": "true",
            "alb.ingress.kubernetes.io/actions.ssl-redirect":
              '{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS", "Port": "443", "StatusCode": "HTTP_301"}}',
            // Prevent pulumi erroring if ingress doesn't resolve immediately
            "pulumi.com/skipAwait": "true",
          },
          labels: { app: "tezos-node" },
        },
        spec: {
          rules: [
            {
              host: rpcDomain,
              http: {
                paths: [
                  {
                    path: "/*",
                    backend: {
                      serviceName: "ssl-redirect",
                      servicePort: "use-annotation",
                    },
                  },
                  {
                    path: "/*",
                    backend: {
                      serviceName: "tezos-node-rpc",
                      servicePort: "rpc",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      { provider, parent: this, dependsOn: certValidation }
    )
    if (params.getChartRepo() == '') {
      // assume tezos-k8s submodule present; build custom images, and deploy custom chart from path
      const defaultHelmValuesFile = fs.readFileSync(`${params.getChartPath()}/charts/tezos/values.yaml`, 'utf8');
      const defaultHelmValues = YAML.parse(defaultHelmValuesFile);
      const tezosK8sImages = defaultHelmValues["tezos_k8s_images"];
      // do not build zerotier for now since it takes times and it is not used in tqinfra
      delete tezosK8sImages["zerotier"];

      const defaultResourceOptions: pulumi.ResourceOptions = { parent: this }
      
      const registry = repo.repository.registryId.apply(async id => {
        let credentials = await aws.ecr.getCredentials({
          registryId: id
        }, {
          ...defaultResourceOptions,
          async: true,
        });

        let decodedCredentials = Buffer.from(credentials.authorizationToken, "base64").toString();
        let [username, password] = decodedCredentials.split(":");
        if (!password || !username) {
          throw new Error("Invalid credentials");
        }

        return {
          registry: credentials.proxyEndpoint,
          username: username,
          password: password,
        };
      })

      let _cacheFrom: docker.CacheFrom = {}

      const pulumiTaggedImages = Object.entries(tezosK8sImages).reduce(
        (obj: { [index: string]: any }, [key, value]) => {
          let dockerBuild: docker.DockerBuild = {
            dockerfile: `${params.getChartPath()}/${key}/Dockerfile`,
            cacheFrom: _cacheFrom,
            context: `${params.getChartPath()}/${key}`
          };
          obj[key] = docker.buildAndPushImage((value as string).replace(/:.*/, ""), dockerBuild, repo.repository.repositoryUrl, this, () => registry);
          return obj
        },
        {}
      )
      
      params.helmValues["tezos_k8s_images"] = pulumiTaggedImages
      const chain = new k8s.helm.v2.Chart(
        name,
        {
          namespace: ns.metadata.name,
          path: `${params.getChartPath()}/charts/tezos`,
          values: params.helmValues,
        },
        { providers: { kubernetes: this.provider } }
      );
    } else {
      // deploy from helm repo with public images
      const chain = new k8s.helm.v2.Chart(
        name,
        {
          namespace: ns.metadata.name,
          chart: 'tezos-chain',
          version: params.getChartRepoVersion(),
          fetchOpts:
          {
              repo: params.getChartRepo(),
          },
          values: params.helmValues,
        },
        { providers: { kubernetes: this.provider } }
      );
    }

    new k8s.core.v1.Service(
      `${name}-p2p-lb`,
      {
        metadata: {
          namespace: ns.metadata.name,
          name: name,
          annotations: {
            "service.beta.kubernetes.io/aws-load-balancer-type": "nlb-ip",
            "service.beta.kubernetes.io/aws-load-balancer-scheme": "internet-facing",
            "external-dns.alpha.kubernetes.io/hostname": teztnetsDomain,
          },
        },
        spec: {
          ports: [
            {
              port: 9732,
              targetPort: 9732,
              protocol: "TCP",
            },
          ],
          selector: { app: "tezos-baking-node" },
          type: "LoadBalancer",
        },
      },
      { provider: this.provider }
    )


  }


  getChainName(): string {
    return this.params.getChainName();
  }

  getCategory(): string {
    return this.params.getCategory();
  }

  getDescription(): string {
    return this.params.getDescription();
  }

  getNetworkUrl(baseUrl?: string, relativeUrl?: string): string {
    if ("activation_account_name" in this.params.helmValues["node_config_network"]) {
      baseUrl = baseUrl || 'https://teztnets.xyz';
      relativeUrl = relativeUrl || this.params.getName();
      return `${baseUrl}/${relativeUrl}`;
    }

    // network config hardcoded in binary, pass the name instead of URL
    return this.params.getName();
  }

  getDockerBuild(): string {
    return this.params.helmValues["images"]["octez"];
  }

  getProtocols(): Array<{level: number, replacement_protocol: string}> {
    let protocols: Array<{level: number, replacement_protocol: string}> = []
    if ("activation" in this.params.helmValues) {
        protocols.push({level: 0, replacement_protocol: this.params.helmValues["activation"]["protocol_hash"]});
    }
    if ("user_activated_upgrades" in this.params.helmValues["node_config_network"]) {
        //protocols.concat(this.params.helmValues["node_config_network"]["user_activated_upgrades"]);
        protocols = protocols.concat(this.params.helmValues["node_config_network"]["user_activated_upgrades"]);
    }


    return protocols;
  }

}
