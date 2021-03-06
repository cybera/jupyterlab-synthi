import React, { useContext } from 'react';

import ApolloClient from 'apollo-boost';
import { ApolloProvider } from '@apollo/react-hooks';

import { SettingsContext } from './SettingsContext';

const SynthiClient = (props:{ children:any }) => {
  const settings = useContext(SettingsContext)
  const { children } = props

  const client = new ApolloClient({
    uri: settings.endpoint,
    headers: {
      'Authorization': `Api-Key ${settings.apiKey}`
    }
  });

  return (
    <ApolloProvider client={client}>
      { children }
    </ApolloProvider>
  )
}

export default SynthiClient
