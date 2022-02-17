import { action, autorun, computed, observable, runInAction } from "mobx";
import { fromPromise } from "mobx-utils";

import Terria from "terriajs/lib/Models/Terria";
import { TerriaErrorSeverity } from "terriajs/lib/Core/TerriaError";

import { BaseModel } from "terriajs/lib/Models/Definition/Model";
import GroupMixin from "terriajs/lib/ModelMixins/GroupMixin";
import ReferenceMixin from "terriajs/lib/ModelMixins/ReferenceMixin";

import CatalogSearchProvider from "terriajs/lib/Models/SearchProviders/CatalogSearchProvider";
import SearchProviderResults from "terriajs/lib/Models/SearchProviders/SearchProviderResults";
import SearchResult from "terriajs/lib/Models/SearchProviders/SearchResult";

import {
  Category,
  SearchAction
} from "terriajs/lib/Core/AnalyticEvents/analyticEvents";

interface APSVizCatalogSearchProviderOptions {
  terria: Terria;
}

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
            iteration + 1,
            searchBy
          )
        );
      });
      reaction.dispose();
    });
  });
}

export default class APSVizCatalogSearchProvider extends CatalogSearchProvider {
  constructor(options: APSVizCatalogSearchProviderOptions) {
    super(options);
    super.name = "APS Viz Catalog Items";
  }

  @action
  search(searchText: string, searchBy?: string): SearchProviderResults {
    const result = new SearchProviderResults(this);
    result.resultsCompletePromise = fromPromise(
      this.doSearch(searchText, result, searchBy)
    );
    return result;
  }

  @action
  setIsSearching(status: boolean) {
    super.isSearching = status;
  }

  @computed get isSearching() {
    return super.isSearching;
  }

  protected async doSearch(
    searchText: string,
    searchResults: SearchProviderResults,
    searchBy?: string
  ): Promise<void> {
    console.log("APSViz Do Search");

    this.setIsSearching(true);
    searchResults.results.length = 0;
    searchResults.message = undefined;

    if (searchText === undefined || /^\s*$/.test(searchText)) {
      this.setIsSearching(false);
      return Promise.resolve();
    }

    super.terria.analytics?.logEvent(
      Category.search,
      SearchAction.catalog,
      searchText,
      searchBy
    );

    const resultMap: ResultMap = new Map();

    try {
      if (super.terria.catalogIndex) {
        console.log("APSVizCatalogSearchProvider: terria catalogIndex exists");
        const results = await super.terria.catalogIndex?.search(searchText);
        runInAction(() => (searchResults.results = results));
      } else {
        console.log(
          "APSVizCatalogSearchProvider: use loadAndSearchCatalogRecursively instead"
        );
        let defaultIteration = 0;
        await loadAndSearchCatalogRecursively(
          super.terria.modelValues,
          searchText.toLowerCase(),
          searchResults,
          resultMap,
          defaultIteration,
          searchBy
        );
      }

      runInAction(() => {
        this.setIsSearching(false);
      });

      if (searchResults.isCanceled) {
        // A new search has superseded this one, so ignore the result.
        return;
      }

      runInAction(() => {
        super.terria.catalogReferencesLoaded = true;
      });

      if (searchResults.results.length === 0) {
        searchResults.message = "Sorry, no locations match your search query.";
      }
    } catch (e) {
      super.terria.raiseErrorToUser(e, {
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
