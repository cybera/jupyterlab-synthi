import React, { useState, ChangeEvent } from 'react'

import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import Chip from '@material-ui/core/Chip';
import Grid from '@material-ui/core/Grid';
import Card from '@material-ui/core/Card';
import CardActions from '@material-ui/core/CardActions';
import CardContent from '@material-ui/core/CardContent';

import { Cell } from '@jupyterlab/cells';

import { useMutation, useLazyQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { JSONObject } from '@phosphor/coreutils';

import LongOpButton from '../common/LongOpButton'
import TagInput from '../common/TagInput'

interface EditableTransformationInfo {
  name?: string;
  description?: string;
  tagNames?: string[];
}

interface CreateTransformationInput {
  name: string,
  description: string,
  inputs: string[],
  code: string,
  tagNames?: string[],
  organization: string,
}

interface UpdateTransformationInput {
  uuid: string,
  fields: {
    name?: string
    description?: string,
    code?: string,
    inputs?: string[],
    tagNames?: string[],
  }
}

interface TransformationOutput {
  name?: string,
  uuid?: string,
  tags?: { name: string }[]
}

export interface PossibleTransformation {
  fullCode: string,
  inputs: string[],
  functionBody: string,
  functionName: string,
  uuid?: string,
  index: number
}

interface TransformationInspectorProps {
  possibleTransformation: PossibleTransformation,
  organization: string,
  cell: Cell
}

export interface TransformationMapping extends JSONObject {
  uuid: string
}

type HandlerValue = ChangeEvent<HTMLInputElement | any>

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    container: {
      marginLeft: theme.spacing(1),
      marginRight: theme.spacing(1),
    },
    transformationContainer: {
      display: 'flex',
      flexWrap: 'wrap',
      marginBottom: theme.spacing(1),
    },
    transformationContainerContent: {
      width: '100%',
    },
    textField: {
      width: '100%',
    },
    inputs: {
      clear: 'both'
    },
    header: {
      marginLeft: theme.spacing(1),
      marginRight: theme.spacing(1),
      marginTop: theme.spacing(2),
    },
  }),
);

const CREATE_TRANSFORMATION = gql`
	mutation CreateTransformation(
    $name: String!,
    $description: String,
    $inputs: [String],
    $code: String,
    $organization: String!,
    $tagNames: [String]
  ) {
		createTransformationTemplate(
      name: $name,
      description: $description,
      inputs: $inputs,
      code: $code,
      tagNames: $tagNames,
      owner: { name: $organization }
    ) {
			name
                        description
			uuid
      tags {
        name
      }
		}
	}
`;

const UPDATE_TRANSFORMATION = gql`
  mutation UpdateTransformation(
    $uuid: String!,
    $fields: TransformationUpdate!
  ) {
    updateTransformation(uuid: $uuid, fields: $fields) {
      name
      uuid
      description
      tags {
        name
      }
    }
  }
`

const TRANSFORMATION_INFO = gql`
  query TransformationInfo($uuid: String, $organization:String) {
    transformation(uuid: $uuid, org: { name: $organization }) {
      name
      description
      tags {
        name
      }
    }
  }
`

function outputToEditableInfo(transformation: TransformationOutput): EditableTransformationInfo {
  const { tags, ...rest } = transformation
  const tagNames = tags.map((tag) => tag.name)
  return { ...rest, tagNames }
}

/*
  Hook for logic to check for an existing transformation and provide editable state for it.

  Will return a tuple:

  [ existingTransformation, transformationInfo, handleTransformationInfoChange ]

  existingTransformation: true if the transformation was found, false otherwise
  transformationInfo: stateful map (EditableTransformationInfo) of properties
  handleTransformationInfoChange: function factory that creates an event handler given an 
                                  EditableTransformationInfo property name

  Example of using handleTransformationInfoChange:

    handleTransformationInfoChange('name')

  This will handle a change to a 'name' property of EditableTransformationInfo
*/
function useExistingTransformation(uuid: string, organization: string, defaults:EditableTransformationInfo): [
  boolean,
  EditableTransformationInfo,
  (name: keyof EditableTransformationInfo) => (info: HandlerValue) => void
] {
  const [checkForTransformation, setCheckForTransformation] = useState(true)
  const [existingTransformation, setExistingTransformation] = useState(false)

  const [transformationInfo, setTransformationInfo] = useState<EditableTransformationInfo>(defaults);

  const [getTransformation] = useLazyQuery<
    {transformation: TransformationOutput},
    {uuid: string, organization: string}
  >(TRANSFORMATION_INFO, {
    onCompleted: (data) => {
      if (data.transformation) {
        const editableTransformationInfo = outputToEditableInfo(data.transformation)
        setTransformationInfo(editableTransformationInfo)
        setExistingTransformation(true)
      }
    },
    // TODO: Can we figure out how to not have to do this?
    fetchPolicy: 'network-only'
  })

  if (uuid && checkForTransformation) {
    setCheckForTransformation(false)
    getTransformation({ variables: { uuid, organization } })
  }

  const handleTransformationInfoChange = (name: keyof EditableTransformationInfo) => (info: HandlerValue, value?:any) => {
    if (value) {
      setTransformationInfo({ ...transformationInfo, [name]: value });
    } else {
      setTransformationInfo({ ...transformationInfo, [name]: info.target.value });
    }
  }

  return [existingTransformation, transformationInfo, handleTransformationInfoChange]
}

const TransformationInspector = ({ possibleTransformation, organization, cell }: TransformationInspectorProps) => {
  const { inputs, functionBody, functionName, uuid: initUuid } = possibleTransformation

  const classes = useStyles({});

  const [uuid, setUuid] = useState(initUuid)

  // It's important to initialize these with appropriate values, as they set the
  // initial state (including the type of values expected in updates)
  const inspectorDefaults: EditableTransformationInfo = {
    name: functionName,
    tagNames: [],
  }

  const [
    existingTransformation,
    transformationInfo,
    handleTransformationInfoChange
  ] = useExistingTransformation(uuid, organization, inspectorDefaults)

  const [createTransformation] = useMutation<
    { createTransformationTemplate: TransformationOutput },
    CreateTransformationInput
  >(CREATE_TRANSFORMATION)

  const [updateTransformation] = useMutation<
    { updateTransformation: TransformationOutput },
    UpdateTransformationInput
  >(UPDATE_TRANSFORMATION)

  const inputDeclaration = inputs.map(input => `${input} = dataset_input('${input}')`).join('\n')

  let transformationBody = functionBody;
  if (transformationBody.startsWith('\n')) {
    transformationBody = transformationBody.substring(1)
  }
  const transformationCode = `${inputDeclaration}\n\ndef transform():\n${transformationBody}`

  const handleCreateTransformation = async (event: React.MouseEvent<HTMLButtonElement>): Promise<any> => {
    return createTransformation({
      variables: {
        name: transformationInfo.name,
        description: transformationInfo.description,
        inputs: inputs,
        code: transformationCode,
        tagNames: transformationInfo.tagNames,
        organization
      }
    }).then(({ data }) => {
      let mappings = cell.model.metadata.get('synthi_transformations') as unknown as TransformationMapping[]
      if (!mappings) { mappings = [] }
      const { uuid } = data.createTransformationTemplate
      mappings[possibleTransformation.index] = { uuid }
      cell.model.metadata.set('synthi_transformations', mappings)
      setUuid(uuid)
    })    
  }

  const handleUpdateTransformation = async (event: React.MouseEvent<HTMLButtonElement>): Promise<any> => {
    return updateTransformation({
      variables: {
        uuid: uuid,
        fields: {
          name: transformationInfo.name,
          description: transformationInfo.description,
          code: transformationCode,
          inputs,
          tagNames: transformationInfo.tagNames
        }
      }
    })
  }

  return (
    <Card className={classes.transformationContainer} raised>
      <CardContent className={classes.transformationContainerContent}>
        <Grid container direction="column" spacing={1}>
          <Grid item>
            <TextField
              id="outlined-name"
              label="Name"
              className={classes.textField}
              value={transformationInfo.name}
              onChange={handleTransformationInfoChange('name')}
              margin="normal"
              variant="filled"
            />
          </Grid>
          <Grid item>
            <Typography variant="h6" gutterBottom>
              Inputs
            </Typography>
          </Grid>
          <Grid item>
            <Grid container className={classes.inputs} direction="row" spacing={1}>
              { possibleTransformation.inputs.map(input => (
                <Grid item key={input}>
                  <Chip label={input} variant="outlined" size="small" />
                </Grid>
              ))}
            </Grid>
          </Grid>
          <Grid item>
            <pre>
              { transformationCode }
            </pre>
          </Grid>
          <Grid item>
            <TextField
              id="description"
              label="Description"
              className={classes.textField}
              value={transformationInfo.description ? transformationInfo.description : ''}
              onChange={handleTransformationInfoChange('description')}
              margin="normal"
              InputLabelProps={transformationInfo.description ? { shrink: true } : { shrink: false }}
              multiline
            />
          </Grid>
          <Grid item>
            <TagInput 
              value={transformationInfo.tagNames}
              onChange={handleTransformationInfoChange('tagNames')}
            />
          </Grid>
        </Grid>
      </CardContent>
      <CardActions>
        <LongOpButton 
          handler={existingTransformation ? handleUpdateTransformation : handleCreateTransformation }
        >
          { existingTransformation ? 'Update' : 'Create' } Transformation
        </LongOpButton>
      </CardActions>
    </Card>
  )
}

export default TransformationInspector
