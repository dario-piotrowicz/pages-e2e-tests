import { existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import shellac from "shellac";
import stripJsonComments from "strip-json-comments";
import { FEATURES_PATH } from "./config";
import { Logger } from "./logger";
import { FeatureConfig, featuresSchema } from "./schemas";

export type FeaturesConfig = Pick<Required<FeatureConfig>, "deploymentConfig">;

export const setUpFeatures = async ({
	logger,
	fixture,
	features,
	directory,
}: {
	logger: Logger;
	fixture: string;
	features: string[];
	directory: string;
}) => {
	const featuresConfig: FeaturesConfig = {
		deploymentConfig: {
			environmentVariables: {},
			d1Databases: {},
			durableObjectNamespaces: {},
			kvNamespaces: {},
			r2Buckets: {},
			services: {},
			queueProducers: {},
		},
	};

	features = await resolveFeatures(features);

	if (features.length > 0) {
		logger.log(`Fixture features detected. Adding ${features.join(", ")}...`);

		for (const feature of features) {
			const path = join(FEATURES_PATH, feature);

			logger.log("Reading fixture config...");

			const featureMain = join(path, "main.feature");

			if (!existsSync(featureMain)) {
				throw new Error(
					`Could not find feature file for feature '${feature}' (defined in fixture '${fixture}')`
				);
			}

			const config = featuresSchema.parse(
				JSON.parse(
					stripJsonComments(await readFile(join(path, "main.feature"), "utf-8"))
				)
			);
			logger.info("Done.");

			featuresConfig.deploymentConfig = {
				environmentVariables: {
					...featuresConfig.deploymentConfig.environmentVariables,
					...config.deploymentConfig.environmentVariables,
				},
				d1Databases: {
					...featuresConfig.deploymentConfig.d1Databases,
					...config.deploymentConfig.d1Databases,
				},
				durableObjectNamespaces: {
					...featuresConfig.deploymentConfig.durableObjectNamespaces,
					...config.deploymentConfig.durableObjectNamespaces,
				},
				kvNamespaces: {
					...featuresConfig.deploymentConfig.kvNamespaces,
					...config.deploymentConfig.kvNamespaces,
				},
				r2Buckets: {
					...featuresConfig.deploymentConfig.r2Buckets,
					...config.deploymentConfig.r2Buckets,
				},
				services: {
					...featuresConfig.deploymentConfig.services,
					...config.deploymentConfig.services,
				},
				queueProducers: {
					...featuresConfig.deploymentConfig.queueProducers,
					...config.deploymentConfig.queueProducers,
				},
			};

			logger.log(`Setting up feature ${feature}...`);
			if (config.setup) {
				await shellac.in(path)`
					$ export NODE_EXTRA_CA_CERTS=${process.env.NODE_EXTRA_CA_CERTS}
					$ export WORKSPACE_DIR=${directory}
					$ ${config.setup}
					stdout >> ${logger.info}
				`;
			} else {
				logger.info("No setup command found. Continuing...");
			}
			logger.info("Done.");
		}

		logger.info("Done.");
	}

	return { config: featuresConfig };
};

/**
 * Resolves features so that we expand `*`s if they contain any
 *
 * meaning that if the features directory contains `my-feature-a` and `my-feature-b`
 * both can be selected via `"my-feature-*"`
 *
 * @param features strings representing features potentially containing `*`s
 * @returns strings representing files/directories inside the feature directory matching the provides raw feature strings
 */
async function resolveFeatures(features: string[]): Promise<string[]> {
	return (
		await Promise.all(
			features.map(async (feature) => {
				const featureNameRegex = new RegExp(feature.replaceAll("*", ".*"));

				return (await readdir(FEATURES_PATH))
					.map((file) => featureNameRegex.test(file) && file)
					.filter(Boolean);
			})
		)
	).flat();
}
