import { SwaggerSchema, Operation } from "../models/SwaggerSchema";
import {
  getEndpointsDescriptions,
  EndpointDescription,
} from "./ApiDescriptionGenerator";
import { render } from "mustache";
import { Maybe, Nothing, Just } from "purify-ts";
import { getTypeNameFromRef } from "./Common";

const getRequestContractType = (
  endpointDescription: EndpointDescription
): Maybe<{ contractParameterName: string; formattedParam: string }> => {
  const post = endpointDescription.pathObject.post;
  if (post && post.requestBody?.content["application/json"]) {
    const schema = post.requestBody.content["application/json"].schema;
    return Maybe.fromNullable(schema.$ref)
      .chain((e) => Just(getTypeNameFromRef(e)))
      .chain((v) =>
        Just({
          contractParameterName: "requestContract",
          formattedParam: `requestContract: ${v}`,
        })
      );
  }
  return Nothing;
};

const getContractResult = (
  endpointDescription: EndpointDescription
): Maybe<string> => {
  const getTypeFromOperation = (operation: Operation) => {
    const schema =
      operation.responses["200"].content["application/json"].schema;
    if (schema.type === "array") {
      const typeName = Maybe.fromNullable(schema.items)
        .chain((e) => (e instanceof Array ? Just(e[0]) : Just(e)))
        .chain((e) => (e.$ref ? Just(e.$ref) : Nothing))
        .chain((e) => Just(getTypeNameFromRef(e)))
        .orDefault("");
      return Just(`${typeName}[]`);
    }
    return Maybe.fromNullable(schema.$ref).chain((e) =>
      Just(getTypeNameFromRef(e))
    );
  };
  const post = endpointDescription.pathObject.post;
  if (post && post.responses["200"]?.content?.["application/json"]) {
    return getTypeFromOperation(post);
  }

  const get = endpointDescription.pathObject.get;
  if (get && get.responses["200"]?.content?.["application/json"]) {
    return getTypeFromOperation(get);
  }

  return Nothing;
};

const GET = (
  endpointDescription: EndpointDescription,
  contractParameterName: string,
  contractResult: string,
  baseUrl: string
) => {
  const view = {
    name: endpointDescription.name,
    contractParameterName,
    contractResult,
    url: `${baseUrl}${endpointDescription.url}`,
    formattedParam: "headers = new Headers()",
  };

  return render(
    "export const {{name}} = ({{{formattedParam}}}): \n\tPromise<FetchResponse<{{contractResult}}>> => \n\tapiGet('{{{url}}}', headers);\n",
    view
  );
};

const POST = (
  endpointDescription: EndpointDescription,
  formattedParam: string,
  contractParameterName: string,
  contractResult: string,
  baseUrl: string
) => {
  const view = {
    name: endpointDescription.name,
    formattedParam,
    contractParameterName,
    contractResult,
    url: `${baseUrl}${endpointDescription.url}`,
  };

  return render(
    "export const {{name}} = ({{{formattedParam}}}): \n\tPromise<FetchResponse<{{contractResult}}>> => \n\tapiPost('{{{url}}}', {{contractParameterName}}, headers);\n",
    view
  );
};

export const generateServices = (swagger: SwaggerSchema, baseUrl: string) => {
  const endpoints = getEndpointsDescriptions(swagger);
  const view = endpoints
    .map((endpointDescription) => {
      const {
        formattedParam: formattedRequestContractType,
        contractParameterName,
      } = getRequestContractType(endpointDescription).orDefault({
        formattedParam: "",
        contractParameterName: "{}",
      });
      const comma = formattedRequestContractType.length > 0 ? ", " : "";

      const contractResult = getContractResult(endpointDescription).orDefault(
        "any"
      );
      const formattedParam = `${formattedRequestContractType}${comma}headers = new Headers()`;
      if (endpointDescription.pathObject.post) {
        return POST(
          endpointDescription,
          formattedParam,
          contractParameterName,
          contractResult,
          baseUrl
        );
      }
      if (endpointDescription.pathObject.get) {
        return GET(
          endpointDescription,
          contractParameterName,
          contractResult,
          baseUrl
        );
      }
      return `// ${endpointDescription.name}\n`;
    })
    .join("\n");

  return view;
};
