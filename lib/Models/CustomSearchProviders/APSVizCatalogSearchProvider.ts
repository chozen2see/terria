import { autorun, computed, observable, runInAction } from "mobx";
import {
  Category,
  SearchAction
} from "terriajs/lib/Core/AnalyticEvents/analyticEvents";
import isDefined from "terriajs/lib/Core/isDefined";
import { TerriaErrorSeverity } from "terriajs/lib/Core/TerriaError";
import GroupMixin from "terriajs/lib/ModelMixins/GroupMixin";
import ReferenceMixin from "terriajs/lib/ModelMixins/ReferenceMixin";
import { BaseModel } from "terriajs/lib/Models/Definition/Model";
import Terria from "terriajs/lib/Models/Terria";

// create local version of this file
import SearchProvider from "terriajs/lib/Models/SearchProviders/SearchProvider";

import SearchProviderResults from "terriajs/lib/Models/SearchProviders/SearchProviderResults";

import SearchResult from "terriajs/lib/Models/SearchProviders/SearchResult";

interface CatalogSearchProviderOptions {
  terria: Terria;
}

// import saveModelToJson from "../Definition/saveModelToJson"

type UniqueIdString = string;
type ResultMap = Map<UniqueIdString, boolean>;
export function loadAndSearchCatalogRecursively(
  models: BaseModel[],
  searchTextLowercase: string,
  searchResults: SearchProviderResults,
  resultMap: ResultMap,
  iteration: number = 0,
  // added to allow Search By Type and Search By Day
  searchBy: string = "default"
): Promise<void> {
  // checkTerriaAgainstResults(terria, searchResults)
  // don't go further than 10 deep, but also if we have references that never
  // resolve to a target, might overflow
  if (iteration > 10) {
    return Promise.resolve();
  }

  // add some public interface for terria's `models`?
  const referencesAndGroupsToLoad: any[] = models.filter((model: any) => {
    if (resultMap.get(model.uniqueId) === undefined) {
      const modelToSave = model.target || model;
      // Use a flattened string of definition data later,
      // without only checking name/id/descriptions?
      // saveModelToJson(modelToSave, {
      //   includeStrata: [CommonStrata.definition]
      // });

      // const modelToSaveJson = saveModelToJson(modelToSave);
      autorun(reaction => {
        // const searchString = `${modelToSave.name} ${modelToSave.uniqueId} ${modelToSave.description}`;
        let searchString = "";

        switch (searchBy) {
          case "date": {
            searchString = `${modelToSave.info[0]?.content}`;
            break;
          }
          case "event": {
            searchString = `${modelToSave.info[1]?.content}`;
            break;
          }
          default: {
            searchString = `${modelToSave.name} ${modelToSave.uniqueId} ${modelToSave.description}`;
            break;
          }
        }

        console.log("CUSTOM SEARCH:", searchString);

        const matchesString =
          searchString.toLowerCase().indexOf(searchTextLowercase) !== -1;
        resultMap.set(model.uniqueId, matchesString);
        if (matchesString) {
          runInAction(() => {
            searchResults.results.push(
              new SearchResult({
                name: name,
                catalogItem: modelToSave
              })
            );
          });
        }
        reaction.dispose();
      });
    }

    if (ReferenceMixin.isMixedInto(model) || GroupMixin.isMixedInto(model)) {
      return true;
    }
    // Could also check for loadMembers() here, but will be even slower
    // (relies on external non-magda services to be performant)

    return false;
  });

  // If we have no members to load
  if (referencesAndGroupsToLoad.length === 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    autorun(reaction => {
      Promise.all(
        referencesAndGroupsToLoad.map(async model => {
          if (ReferenceMixin.isMixedInto(model)) {
            // TODO: could handle errors better here
            (await model.loadReference()).throwIfError();
          }
          // TODO: investigate performant route for calling loadMembers on additional groupmixins
          // else if (GroupMixin.isMixedInto(model)) {
          //   return model.loadMembers();
          // }
        })
      ).then(() => {
        // Then call this function again to see if new child references were loaded in
        resolve(
          loadAndSearchCatalogRecursively(
            models,
            searchTextLowercase,
            searchResults,
            resultMap,
            iteration + 1
          )
        );
      });
      reaction.dispose();
    });
  });
}

export default class APSVizCatalogSearchProvider extends SearchProvider {
  readonly terria: Terria;
  @observable isSearching: boolean = false;
  @observable debounceDurationOnceLoaded: number = 300;

  constructor(options: CatalogSearchProviderOptions) {
    super();

    this.terria = options.terria;
    this.name = "APSViz Catalog Items";
    console.log("APSVizCatalogSearchProvider Constructor");
  }

  @computed get resultsAreReferences() {
    return isDefined(this.terria.catalogIndex);
  }

  protected async doSearch(
    searchText: string,
    searchResults: SearchProviderResults,
    searchBy?: string
  ): Promise<void> {
    this.isSearching = true;
    searchResults.results.length = 0;
    searchResults.message = undefined;

    if (searchText === undefined || /^\s*$/.test(searchText)) {
      this.isSearching = false;
      return Promise.resolve();
    }

    this.terria.analytics?.logEvent(
      Category.search,
      SearchAction.catalog,
      searchText
    );
    const resultMap: ResultMap = new Map();

    try {
      if (this.terria.catalogIndex) {
        console.log("APSVizCatalogSearchProvider: terria catalogIndex exists");
        const results = await this.terria.catalogIndex?.search(searchText);
        runInAction(() => (searchResults.results = results));
      } else {
        console.log(
          "APSVizCatalogSearchProvider: use loadAndSearchCatalogRecursively instead"
        );
        let defaultIteration = 0;
        await loadAndSearchCatalogRecursively(
          this.terria.modelValues,
          searchText.toLowerCase(),
          searchResults,
          resultMap,
          defaultIteration,
          searchBy
        );
      }

      runInAction(() => {
        this.isSearching = false;
      });

      if (searchResults.isCanceled) {
        // A new search has superseded this one, so ignore the result.
        return;
      }

      runInAction(() => {
        this.terria.catalogReferencesLoaded = true;
      });

      if (searchResults.results.length === 0) {
        searchResults.message = "Sorry, no locations match your search query.";
      }
    } catch (e) {
      this.terria.raiseErrorToUser(e, {
        message: "An error occurred while searching",
        severity: TerriaErrorSeverity.Warning
      });
      if (searchResults.isCanceled) {
        // A new search has superseded this one, so ignore the result.
        return;
      }

      searchResults.message =
        "An error occurred while searching.  Please check your internet connection or try again later.";
    }
  }
}
