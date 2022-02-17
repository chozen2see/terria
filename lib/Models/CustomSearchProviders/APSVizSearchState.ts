import { observable, action } from "mobx";

import Terria from "terriajs/lib/Models/Terria";
import SearchState from "terriajs/lib/ReactViewModels/SearchState";
import APSVizCatalogSearchProvider from "./APSVizCatalogSearchProvider";
// import SearchProviderResults from "terriajs/lib/Models/SearchProviders/SearchProviderResults";
import SearchProvider from "terriajs/lib/Models/SearchProviders/SearchProvider";

interface SearchStateOptions {
  terria: Terria;
  catalogSearchProvider?: APSVizCatalogSearchProvider;
  locationSearchProviders?: SearchProvider[];
}

export default class APSVizSearchState extends SearchState {
  constructor(options: SearchStateOptions) {
    super(options);
  }

  @observable
  catalogSearchProvider: APSVizCatalogSearchProvider | undefined;

  @observable
  catalogSearchText: string = "";

  @action
  searchCatalog(searchBy?: string) {
    // if searchBy is undefined set it to default
    searchBy = searchBy !== undefined ? searchBy : "default";
    if (super.isWaitingToStartCatalogSearch) {
      super.isWaitingToStartCatalogSearch = false;
      if (super.catalogSearchResults) {
        super.catalogSearchResults.isCanceled = true;
      }
      console.log("SearchState.searchCatalog", this.catalogSearchProvider);
      if (this.catalogSearchProvider) {
        // this is causing the error right now. search can't be called directly from catalogSearchProvider
        super.catalogSearchResults = this.catalogSearchProvider.search(
          this.catalogSearchText,
          searchBy
        );
      }
    }
  }
}
